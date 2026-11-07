// @ts-check
// Les GitHub Apps de la station de cet ordinateur, dans Settings, sous cette machine (ticket 2317, épique 2313) : le
// chef remet à la station l'App ID et la clé privée de l'App de chaque rôle — cook, pass, manager —, un rôle à la fois.
// Une ligne d'en-tête dit que les clés restent sur cette station ; puis une ligne par rôle : son état, `configured` ou
// `not configured`, et son formulaire — l'App ID, la clé (collée, ou lue du fichier .pem choisi), « save ».
//
// La clé n'est jamais rendue : l'écran ne la reçoit d'aucune lecture — la station dit seulement si elle l'a —, et une
// fois rangée, elle quitte l'état de l'écran et son champ se vide. Lue d'un fichier, elle n'est pas écrite dans le
// champ : seul le nom du fichier se lit.
//
// Ce qui ne se range pas ne part pas : un App ID vide (ou qui n'en a pas la forme) ou une clé qui n'est pas une clé
// privée PEM se disent sous leur champ, et rien n'est écrit. Le reste est vérifié par la station, qui range l'App
// (runtime/src/identites-stations.ts, `rangerApp`) : son refus se dit sous la ligne, en une ligne, sa suite au survol.
//
// `tenirLesIdentites` garde l'état de l'écran et ses gestes ; `poserLesIdentites` le dessine. Ni l'un ni l'autre ne
// touche `document` : la vue leur donne une fabrique (briques.js).

import { boutonAction, lectureIndisponible, survol } from "./briques.js";

/** @typedef {import("./briques.js").Fabrique} Fabrique */
/** @typedef {"cook" | "pass" | "manager"} Role */
/**
 * Ce que la station a de chaque rôle : l'ID de son App, et si sa clé est là — jamais la clé (`appsRangees`).
 * @typedef {{ role: Role, id: string | null, cle: boolean }} AppDuRole
 */
/** @typedef {{ apps: AppDuRole[] } | { refus: string }} LectureDesApps */
/** @typedef {{ rangee: { role: string, id: string } } | { refus: string }} RenduDuRangement */
/**
 * Ce que l'écran demande au process principal. Absents, ou `appsDeLaStation` qui ne rend rien : cet appareil n'a pas
 * de station (un téléphone), et rien ne se pose.
 * @typedef {{
 *   appsDeLaStation?(): Promise<LectureDesApps | undefined>,
 *   rangerUneApp?(role: Role, id: string, cle: string): Promise<RenduDuRangement>,
 * }} PontDesIdentites
 */
/**
 * Ce que le chef a saisi pour un rôle. `fichier` : le nom du .pem dont la clé a été lue ; `erreurId`, `erreurCle` :
 * ce qui est dit sous chaque champ ; `refus` : ce que la station a refusé ; `rangee` : elle vient de la ranger.
 * @typedef {{ id: string, cle: string, fichier?: string, erreurId?: string, erreurCle?: string, refus?: { ligne: string, detail: string }, enCours: boolean, rangee: boolean }} Saisie
 */
/** @typedef {{ lecture?: LectureDesApps, saisies: Record<Role, Saisie> }} EtatDesIdentites */
/**
 * @typedef {{
 *   saisirId(role: Role, texte: string): void,
 *   saisirCle(role: Role, texte: string): void,
 *   choisirLeFichier(role: Role, nom: string, texte: string): void,
 *   enregistrer(role: Role): void,
 * }} GestesDesIdentites
 */

/** @type {readonly Role[]} */
export const ROLES = ["cook", "pass", "manager"];

// Les mots de l'écran.
export const TITRE = "GitHub Apps";
export const GARDE = "The keys stay on this station: they are never sent to the repository.";
export const AIDE =
  "Each role acts on GitHub under its own App, created once on your GitHub account. Give this station each App's ID and private key: projects it opens from then on act under them. Nothing is copied to the project, its state or its backups.";
export const NOM = (/** @type {Role} */ role) => `${role} App`;
/** @type {Readonly<Record<Role, string>>} */
export const ROLE_DIT = {
  cook: "opens the cooks' pull requests",
  pass: "claims, labels, judges and merges the deliveries",
  manager: "qualifies and splits the issues, and keeps the rail",
};
export const CONFIGURE = "configured";
export const PAS_CONFIGURE = "not configured";
export const APP = (/** @type {string} */ id) => `App ${id}`;
export const SANS_CLE = "no key stored";
export const CHAMP_ID = "App ID";
export const CHAMP_CLE = "paste the private key, or choose its .pem file";
export const CHOISIR = "choose the .pem file";
export const CHOISI = (/** @type {string} */ fichier) => `${fichier} chosen`;
export const ENREGISTRER = "save";
export const ENREGISTREMENT = "saving…";
export const RANGEE = "stored: its key is not shown again";
export const SANS_ID = "nothing was written: enter the App's ID";
export const PAS_UN_ID = "nothing was written: an App ID is the number on the App's page (or its Client ID)";
export const PAS_UNE_CLE = "nothing was written: this is not a private key — give the .pem file downloaded from the App's page";
export const ILLISIBLE = "this station's Apps unavailable";
export const INJOIGNABLE = "The app could not reach this computer's station.";

// L'App ID tel que la station l'accepte : son « App ID », un nombre, ou son « Client ID » (identites.ts, `ID_D_APP`).
const FORME_D_ID = /^[A-Za-z0-9.]+$/;
// Une clé privée PEM : son en-tête, un corps, et le pied du même type. Ce que la station en lit est vérifié chez elle.
const FORME_DE_CLE = /^\s*-----BEGIN ([A-Z0-9 ]*)PRIVATE KEY-----\r?\n[\s\S]+\r?\n-----END \1PRIVATE KEY-----\s*$/;

export const estUneCle = (/** @type {string} */ texte) => FORME_DE_CLE.test(texte);

// Un refus de la station en une ligne : sa première proposition ; ce qui suit son tiret, au survol.
/** @param {string} refus */
export function refusDit(refus) {
  const [ligne = refus, ...suite] = refus.split(" — ");
  return { ligne: `nothing was written: ${ligne.replace(/^brigade: /, "")}`, detail: suite.join(" — ") };
}

/** @returns {Saisie} */
const vide = () => ({ id: "", cle: "", enCours: false, rangee: false });

/** @param {LectureDesApps | undefined} lecture @param {Role} role */
const appDe = (lecture, role) => (lecture !== undefined && "apps" in lecture ? lecture.apps.find((app) => app.role === role) : undefined);

// L'état de l'écran et ses gestes. `rendre` : l'état a changé, l'écran se redessine. Une saisie ne le redessine pas :
// le champ tient déjà ce que le chef tape.
/** @param {{ pont: PontDesIdentites, rendre: () => void }} options */
export function tenirLesIdentites({ pont, rendre }) {
  /** @type {EtatDesIdentites | undefined} */
  let etat;
  let tour = 0;

  /** @returns {EtatDesIdentites} */
  const neuf = () => ({ saisies: { cook: vide(), pass: vide(), manager: vide() } });

  // Ce que la station a de chaque rôle. Une lecture qui ne rend rien : pas de station ici, l'écran se retire.
  async function lire() {
    const sien = ++tour;
    if (typeof pont.appsDeLaStation !== "function") {
      etat = undefined;
      return rendre();
    }
    /** @type {LectureDesApps | undefined} */
    const lue = await pont.appsDeLaStation().catch((erreur) => ({ refus: erreur instanceof Error ? erreur.message : String(erreur) }));
    if (sien !== tour) return;
    if (lue === undefined) etat = undefined;
    else {
      etat ??= neuf();
      etat.lecture = lue;
      // L'App ID rangé préremplit son champ tant que le chef n'en tape pas un autre : il n'a rien de secret.
      for (const role of ROLES) {
        const saisie = etat.saisies[role];
        const id = appDe(lue, role)?.id ?? null;
        if (saisie.id === "" && id !== null) saisie.id = id;
      }
    }
    rendre();
  }

  /** @param {Role} role @param {Partial<Saisie>} change */
  function changer(role, change) {
    if (etat === undefined) return;
    const saisie = etat.saisies[role];
    Object.assign(saisie, change);
    saisie.rangee = false;
    delete saisie.refus;
  }

  return {
    /** @returns {EtatDesIdentites | undefined} */
    get etat() {
      return etat;
    },
    lire,
    /** @type {GestesDesIdentites} */
    gestes: {
      saisirId(role, texte) {
        changer(role, { id: texte });
        if (etat !== undefined) delete etat.saisies[role].erreurId;
      },
      // Collée, la clé remplace celle d'un fichier choisi.
      saisirCle(role, texte) {
        changer(role, { cle: texte });
        if (etat === undefined) return;
        delete etat.saisies[role].fichier;
        delete etat.saisies[role].erreurCle;
      },
      choisirLeFichier(role, nom, texte) {
        changer(role, { cle: texte, fichier: nom });
        if (etat === undefined) return;
        delete etat.saisies[role].erreurCle;
        rendre();
      },
      enregistrer(role) {
        if (etat === undefined) return;
        const saisie = etat.saisies[role];
        if (saisie.enCours) return;
        const id = saisie.id.trim();
        delete saisie.refus;
        saisie.rangee = false;
        if (id === "") saisie.erreurId = SANS_ID;
        else if (!FORME_D_ID.test(id)) saisie.erreurId = PAS_UN_ID;
        else delete saisie.erreurId;
        if (!estUneCle(saisie.cle)) saisie.erreurCle = PAS_UNE_CLE;
        else delete saisie.erreurCle;
        if (saisie.erreurId !== undefined || saisie.erreurCle !== undefined || typeof pont.rangerUneApp !== "function") return rendre();
        saisie.enCours = true;
        rendre();
        void pont
          .rangerUneApp(role, id, saisie.cle)
          .catch((erreur) => ({ refus: `${INJOIGNABLE} — ${erreur instanceof Error ? erreur.message : String(erreur)}` }))
          .then((rendu) => {
            saisie.enCours = false;
            if ("refus" in rendu) saisie.refus = refusDit(rendu.refus);
            else {
              // Rangée, la clé quitte l'écran : son champ se vide, et rien ne la redira.
              saisie.cle = "";
              delete saisie.fichier;
              saisie.id = rendu.rangee.id;
              saisie.rangee = true;
              const lecture = etat?.lecture;
              if (lecture !== undefined && "apps" in lecture) lecture.apps = ROLES.map((autre) => (autre === role ? { role, id: rendu.rangee.id, cle: true } : (appDe(lecture, autre) ?? { role: autre, id: null, cle: false })));
            }
            rendre();
          });
      },
    },
  };
}

// Chaque classe est posée en clair, `className = "…"` : la peau ne vise que des classes que la vue pose, et son test
// les lit ainsi (peau.test.ts).
/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const element = doc.createElement(balise);
  if (texte !== undefined) element.textContent = texte;
  return element;
}

/** @param {Fabrique} doc @param {string} texte */
function erreurSous(doc, texte) {
  const dit = cree(doc, "p", texte);
  dit.className = "dit refus";
  return dit;
}

// Une ligne de réglage, la même que les autres de Settings : son nom, sa valeur, son contrôle — puis, sous elle, ce
// que le contrôle a rendu.
/** @param {Fabrique} doc @param {any[]} nom @param {any[]} valeur @param {any[]} controle @param {any[]} [dessous] */
export function rangee(doc, nom, valeur, controle, dessous = []) {
  const racine = cree(doc, "div");
  racine.className = "reglage";
  const nomme = cree(doc, "span");
  nomme.className = "nom";
  nomme.append(...nom);
  const vaut = cree(doc, "p");
  vaut.className = "valeur";
  vaut.append(...valeur);
  const champ = cree(doc, "div");
  champ.className = "champ";
  champ.append(...controle);
  racine.append(nomme, vaut, champ, ...dessous);
  return racine;
}

// Un rôle est configuré quand la station a son App et sa clé.
/** @param {LectureDesApps | undefined} lecture @param {Role} role */
const estConfigure = (lecture, role) => {
  const app = appDe(lecture, role);
  return app !== undefined && app.id !== null && app.cle;
};

// L'état d'un rôle : `configured` — l'ID dit à côté —, `not configured` sinon.
/** @param {Fabrique} doc @param {LectureDesApps | undefined} lecture @param {Role} role */
function etatDuRole(doc, lecture, role) {
  if (lecture === undefined) return [cree(doc, "span", "reading…")];
  if ("refus" in lecture) return [cree(doc, "span", "–")];
  const app = appDe(lecture, role);
  const pret = estConfigure(lecture, role);
  const mot = cree(doc, pret ? "strong" : "span", pret ? CONFIGURE : PAS_CONFIGURE);
  if (pret) mot.className = "configuree";
  else mot.className = "pas-configuree";
  mot.dataset.etat = pret ? "configured" : "not-configured";
  const valeur = [mot];
  if (app?.id != null) valeur.push(cree(doc, "small", pret ? APP(app.id) : `${APP(app.id)} · ${SANS_CLE}`));
  return [...valeur, survol(doc, `The ${role} App ${ROLE_DIT[role]}.`)];
}

// Le formulaire d'un rôle : l'App ID, la clé — collée, ou lue du .pem choisi —, « save » ; chaque erreur sous son champ.
/** @param {Fabrique} doc @param {Role} role @param {Saisie} saisie @param {boolean} configure @param {GestesDesIdentites} gestes */
function formulaire(doc, role, saisie, configure, gestes) {
  const id = cree(doc, "input");
  id.className = "mono app-id";
  id.type = "text";
  id.value = saisie.id;
  id.placeholder = CHAMP_ID;
  id.ariaLabel = `App ID of the ${role} App`;
  id.spellcheck = false;
  id.autocomplete = "off";
  id.addEventListener("input", () => gestes.saisirId(role, String(id.value)));
  const ligneId = cree(doc, "div");
  ligneId.className = "champ-id";
  ligneId.append(id);
  if (saisie.erreurId !== undefined) ligneId.append(erreurSous(doc, saisie.erreurId));

  const cle = cree(doc, "textarea");
  cle.className = "mono cle";
  cle.rows = 2;
  // Une clé lue d'un fichier ne s'écrit pas dans le champ : son nom se lit à côté.
  cle.value = saisie.fichier === undefined ? saisie.cle : "";
  cle.placeholder = CHAMP_CLE;
  cle.ariaLabel = `Private key of the ${role} App`;
  cle.spellcheck = false;
  cle.autocomplete = "off";
  cle.addEventListener("input", () => gestes.saisirCle(role, String(cle.value)));
  const fichier = cree(doc, "input");
  fichier.type = "file";
  fichier.accept = ".pem,application/x-pem-file";
  fichier.hidden = true;
  fichier.ariaLabel = `The ${role} App's .pem file`;
  fichier.addEventListener("change", () => {
    const choisi = fichier.files?.[0];
    if (choisi === undefined) return;
    void choisi.text().then((/** @type {string} */ texte) => gestes.choisirLeFichier(role, String(choisi.name), texte));
    fichier.value = "";
  });
  const ligneCle = cree(doc, "div");
  ligneCle.className = "champ-cle";
  ligneCle.append(cle, fichier);
  if (saisie.fichier !== undefined) {
    const nomme = cree(doc, "small", CHOISI(saisie.fichier));
    nomme.className = "mono fichier";
    ligneCle.append(nomme);
  }
  if (saisie.erreurCle !== undefined) ligneCle.append(erreurSous(doc, saisie.erreurCle));

  // « save » est le geste attendu tant que le rôle n'est pas configuré ; configuré, il ne sert qu'à remplacer l'App.
  const gestesDuRole = cree(doc, "div");
  gestesDuRole.className = "gestes-du-role";
  gestesDuRole.append(
    boutonAction(doc, CHOISIR, () => fichier.click()),
    saisie.enCours ? cree(doc, "span", ENREGISTREMENT) : boutonAction(doc, ENREGISTRER, () => gestes.enregistrer(role), { recommande: !configure }),
  );
  return [ligneId, ligneCle, gestesDuRole];
}

// L'écran : la ligne d'en-tête — où les clés restent —, puis une ligne par rôle.
/** @param {Fabrique} doc @param {EtatDesIdentites} etat @param {GestesDesIdentites} gestes */
export function poserLesIdentites(doc, etat, gestes) {
  const racine = cree(doc, "div");
  racine.className = "apps-github";
  racine.ariaLive = "polite";
  const garde = cree(doc, "span", GARDE);
  garde.className = "garde";
  const lue = etat.lecture;
  const tete = rangee(doc, [TITRE], [garde, survol(doc, AIDE)], lue !== undefined && "refus" in lue ? [lectureIndisponible(doc, ILLISIBLE, lue.refus)] : []);
  tete.className = "reglage tete";
  racine.append(tete);
  for (const role of ROLES) {
    const saisie = etat.saisies[role];
    const dessous = [];
    if (saisie.refus !== undefined) {
      const dit = cree(doc, "p", saisie.refus.ligne);
      dit.className = "dit refus";
      if (saisie.refus.detail !== "") dit.append(survol(doc, saisie.refus.detail));
      dessous.push(dit);
    } else if (saisie.rangee) {
      const dit = cree(doc, "p", RANGEE);
      dit.className = "dit";
      dessous.push(dit);
    }
    const ligne = rangee(doc, [NOM(role)], etatDuRole(doc, lue, role), formulaire(doc, role, saisie, estConfigure(lue, role), gestes), dessous);
    ligne.dataset.role = role;
    racine.append(ligne);
  }
  return racine;
}
