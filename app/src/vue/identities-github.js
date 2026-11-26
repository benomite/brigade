// @ts-check
// Les GitHub Apps de la station de cet ordinateur, dans Settings, sous cette machine (ticket 2317, épique 2313) : le
// chef remet à la station l'App ID et la clé privée de l'App de chaque rôle — cook, pass, manager —, un rôle à la fois.
// Une ligne d'en-tête dit que les clés restent sur cette station ; puis une ligne par rôle : son état, `configured` ou
// `not configured`, et son contrôle — l'App ID, la clé (collée, ou lue du fichier .pem choisi). Chaque ligne est la
// rangée de réglage de l'app (composants/setting, ticket 2920) : pas de « save », l'App se range dès que son contrôle
// change — le `change` d'un des deux champs, ou un .pem choisi — une fois la clé écrite ; l'App ID est jugé alors.
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

import { buttonAction, survol } from "./briques.js";
import { lineError } from "./composants/line-error/line-error.js";
import { ditDuSetting, rangeeDeSetting } from "./composants/setting/setting.js";
import { CET_ORDINATEUR, ENREGISTREMENT, NON_ATTEINT, READ } from "./lexique.js";

/** @typedef {import("./briques.js").Fabrique} Fabrique */
/** @typedef {"cook" | "pass" | "manager"} Role */
/**
 * Ce que la station a de chaque rôle : l'ID de son App, et si sa clé est là — jamais la clé (`appsRangees`).
 * @typedef {{ role: Role, id: string | null, cle: boolean }} AppDuRole
 */
/** @typedef {{ apps: AppDuRole[] } | { refus: string }} ReadDesApps */
/** @typedef {{ rangee: { role: string, id: string } } | { refus: string }} RenduDuCleanup */
/**
 * Ce que l'écran demande au process principal. Absents, ou `appsDeLaStation` qui ne rend rien : cet appareil n'a pas
 * de station (un téléphone), et rien ne se pose.
 * @typedef {{
 *   appsDeLaStation?(): Promise<ReadDesApps | undefined>,
 *   rangerUneApp?(role: Role, id: string, cle: string): Promise<RenduDuCleanup>,
 * }} PontDesIdentities
 */
/**
 * Ce que le chef a saisi pour un rôle. `fichier` : le nom du .pem dont la clé a été lue ; `erreurId`, `erreurCle` :
 * ce qui est dit sous chaque champ ; `refus` : ce que la station a refusé ; `rangee` : elle vient de la ranger.
 * @typedef {{ id: string, cle: string, fichier?: string, erreurId?: string, erreurCle?: string, refus?: { ligne: string, detail: string }, attendCle?: boolean, enCours: boolean, rangee: boolean }} Saisie
 */
/** @typedef {{ lecture?: ReadDesApps, saisies: Record<Role, Saisie> }} StateDesIdentities */
/**
 * @typedef {{
 *   saisirId(role: Role, texte: string): void,
 *   saisirCle(role: Role, texte: string): void,
 *   choisirLeFichier(role: Role, name: string, texte: string): void,
 *   enregistrer(role: Role): void,
 * }} ActionsDesIdentities
 */

/** @type {readonly Role[]} */
export const ROLES = ["cook", "pass", "manager"];

// Les mots de l'écran.
export const TITRE = "GitHub Apps";
export const GUARD = "The keys stay on this station: they are never sent to the repository.";
export const AIDE =
  "Each role acts on GitHub under its own App, created once on your GitHub account. Give this station each App's ID and private key: projects it opens from then on act under them. Nothing is copied to the project, its state or its backups.";
export const NAME = (/** @type {Role} */ role) => `${role} App`;
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
export { ENREGISTREMENT };
export const RANGEE = "stored: its key is not shown again";
export const CLE_ATTENDUE = "not applied yet: an App ID is stored with its private key — paste it, or choose its .pem file";
export const SANS_ID = "nothing was written: enter the App's ID";
export const PAS_UN_ID = "nothing was written: an App ID is the number on the App's page (or its Client ID)";
export const PAS_UNE_CLE = "nothing was written: this is not a private key — give the .pem file downloaded from the App's page";
export const ILLISIBLE = NON_ATTEINT("this station's Apps");
export const INJOIGNABLE = NON_ATTEINT(`${CET_ORDINATEUR}'s station`);

// L'App ID tel que la station l'accepte : son « App ID », un nombre, ou son « Client ID » (identites.ts, `ID_D_APP`).
const FORME_D_ID = /^[A-Za-z0-9.]+$/;
// Une clé privée PEM : son en-tête, un corps, et le pied du même type. Ce que la station en lit est vérifié chez elle.
const FORME_DE_CLE = /^\s*-----BEGIN ([A-Z0-9 ]*)PRIVATE KEY-----\r?\n[\s\S]+\r?\n-----END \1PRIVATE KEY-----\s*$/;

export const estUneCle = (/** @type {string} */ texte) => FORME_DE_CLE.test(texte);

// Un refus de la station en une ligne : sa première proposition ; ce qui suit son tiret, au survol.
/** @param {string} refusal */
export function refusalDit(refusal) {
  const [line = refusal, ...suite] = refusal.split(" — ");
  return { ligne: `nothing was written: ${line.replace(/^brigade: /, "")}`, detail: suite.join(" — ") };
}

/** @returns {Saisie} */
const empty = () => ({ id: "", cle: "", enCours: false, rangee: false });

/** @param {ReadDesApps | undefined} read @param {Role} role */
const appDe = (read, role) => (read !== undefined && "apps" in read ? read.apps.find((app) => app.role === role) : undefined);

// L'état de l'écran et ses gestes. `rendre` : l'état a changé, l'écran se redessine. Une saisie ne le redessine pas :
// le champ tient déjà ce que le chef tape.
/** @param {{ pont: PontDesIdentities, rendre: () => void }} options */
export function holdLesIdentities({ pont, rendre }) {
  /** @type {StateDesIdentities | undefined} */
  let state;
  let tour = 0;

  /** @returns {StateDesIdentities} */
  const neuf = () => ({ saisies: { cook: empty(), pass: empty(), manager: empty() } });

  // Ce que la station a de chaque rôle. Une lecture qui ne rend rien : pas de station ici, l'écran se retire.
  async function lire() {
    const sien = ++tour;
    if (typeof pont.appsDeLaStation !== "function") {
      state = undefined;
      return rendre();
    }
    /** @type {ReadDesApps | undefined} */
    const lue = await pont.appsDeLaStation().catch((error) => ({ refus: error instanceof Error ? error.message : String(error) }));
    if (sien !== tour) return;
    if (lue === undefined) state = undefined;
    else {
      state ??= neuf();
      state.lecture = lue;
      // L'App ID rangé préremplit son champ tant que le chef n'en tape pas un autre : il n'a rien de secret.
      for (const role of ROLES) {
        const saisie = state.saisies[role];
        const id = appDe(lue, role)?.id ?? null;
        if (saisie.id === "" && id !== null) saisie.id = id;
      }
    }
    rendre();
  }

  /** @param {Role} role @param {Partial<Saisie>} change */
  function changer(role, change) {
    if (state === undefined) return;
    const saisie = state.saisies[role];
    Object.assign(saisie, change);
    saisie.rangee = false;
    delete saisie.refus;
  }

  return {
    /** @returns {StateDesIdentities | undefined} */
    get etat() {
      return state;
    },
    lire,
    /** @type {ActionsDesIdentities} */
    gestes: {
      saisirId(role, texte) {
        changer(role, { id: texte });
        if (state !== undefined) delete state.saisies[role].erreurId;
      },
      // Collée, la clé remplace celle d'un fichier choisi.
      saisirCle(role, texte) {
        changer(role, { cle: texte });
        if (state === undefined) return;
        delete state.saisies[role].fichier;
        delete state.saisies[role].erreurCle;
      },
      choisirLeFichier(role, name, texte) {
        changer(role, { cle: texte, fichier: name });
        if (state === undefined) return;
        delete state.saisies[role].erreurCle;
        rendre();
      },
      enregistrer(role) {
        if (state === undefined) return;
        const saisie = state.saisies[role];
        if (saisie.enCours) return;
        const id = saisie.id.trim();
        // Sans clé, rien ne se range : un App ID qui n'est pas celui que la station a déjà le dit sous la ligne, plutôt
        // que de rester sans effet en silence ; un champ vidé n'a rien à ranger.
        if (saisie.cle.trim() === "") {
          saisie.attendCle = id !== "" && id !== (appDe(state.lecture, role)?.id ?? "");
          return rendre();
        }
        delete saisie.attendCle;
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
          .catch((error) => ({ refus: `${INJOIGNABLE} — ${error instanceof Error ? error.message : String(error)}` }))
          .then((rendu) => {
            saisie.enCours = false;
            if ("refus" in rendu) saisie.refus = refusalDit(rendu.refus);
            else {
              // Rangée, la clé quitte l'écran : son champ se vide, et rien ne la redira.
              saisie.cle = "";
              delete saisie.fichier;
              saisie.id = rendu.rangee.id;
              saisie.rangee = true;
              const read = state?.lecture;
              if (read !== undefined && "apps" in read) read.apps = ROLES.map((autre) => (autre === role ? { role, id: rendu.rangee.id, cle: true } : (appDe(read, autre) ?? { role: autre, id: null, cle: false })));
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
function errorSous(doc, texte) {
  return lineError(doc, texte, "", { classe: "dit refus" });
}

// Un rôle est configuré quand la station a son App et sa clé.
/** @param {ReadDesApps | undefined} read @param {Role} role */
const estConfigure = (read, role) => {
  const app = appDe(read, role);
  return app !== undefined && app.id !== null && app.cle;
};

// L'état d'un rôle : `configured` — l'ID dit à côté —, `not configured` sinon.
/** @param {Fabrique} doc @param {ReadDesApps | undefined} read @param {Role} role */
function stateDuRole(doc, read, role) {
  if (read === undefined) return [cree(doc, "span", READ)];
  if ("refus" in read) return [cree(doc, "span", "–")];
  const app = appDe(read, role);
  const pret = estConfigure(read, role);
  const word = cree(doc, pret ? "strong" : "span", pret ? CONFIGURE : PAS_CONFIGURE);
  if (pret) word.className = "configuree";
  else word.className = "pas-configuree";
  word.dataset.etat = pret ? "configured" : "not-configured";
  const valeur = [word];
  if (app?.id != null) valeur.push(cree(doc, "small", pret ? APP(app.id) : `${APP(app.id)} · ${SANS_CLE}`));
  return [...valeur, survol(doc, `The ${role} App ${ROLE_DIT[role]}.`)];
}

// Le contrôle d'un rôle : l'App ID, la clé — collée, ou lue du .pem choisi — ; chaque erreur sous son champ. Il
// s'applique à son `change` : `enregistrer` juge l'App ID et la clé, et range l'App — sans clé, il dit qu'elle manque.
/** @param {Fabrique} doc @param {Role} role @param {Saisie} saisie @param {ActionsDesIdentities} actions */
function formulaire(doc, role, saisie, actions) {
  const appliquer = () => actions.enregistrer(role);
  const id = cree(doc, "input");
  id.className = "mono app-id";
  id.type = "text";
  id.value = saisie.id;
  id.placeholder = CHAMP_ID;
  id.ariaLabel = `App ID of the ${role} App`;
  id.spellcheck = false;
  id.autocomplete = "off";
  id.addEventListener("input", () => actions.saisirId(role, String(id.value)));
  id.addEventListener("change", () => {
    actions.saisirId(role, String(id.value));
    appliquer();
  });
  const lineId = cree(doc, "div");
  lineId.className = "champ-id";
  lineId.append(id);
  if (saisie.erreurId !== undefined) lineId.append(errorSous(doc, saisie.erreurId));

  const cle = cree(doc, "textarea");
  cle.className = "mono cle";
  cle.rows = 2;
  // Une clé lue d'un fichier ne s'écrit pas dans le champ : son nom se lit à côté.
  cle.value = saisie.fichier === undefined ? saisie.cle : "";
  cle.placeholder = CHAMP_CLE;
  cle.ariaLabel = `Private key of the ${role} App`;
  cle.spellcheck = false;
  cle.autocomplete = "off";
  cle.addEventListener("input", () => actions.saisirCle(role, String(cle.value)));
  cle.addEventListener("change", () => {
    actions.saisirCle(role, String(cle.value));
    appliquer();
  });
  const fichier = cree(doc, "input");
  fichier.type = "file";
  fichier.accept = ".pem,application/x-pem-file";
  fichier.hidden = true;
  fichier.ariaLabel = `The ${role} App's .pem file`;
  fichier.addEventListener("change", () => {
    const choisi = fichier.files?.[0];
    if (choisi === undefined) return;
    void choisi.text().then((/** @type {string} */ texte) => {
      actions.choisirLeFichier(role, String(choisi.name), texte);
      appliquer();
    });
    fichier.value = "";
  });
  const lineCle = cree(doc, "div");
  lineCle.className = "champ-cle";
  lineCle.append(cle, fichier);
  if (saisie.fichier !== undefined) {
    const nomme = cree(doc, "small", CHOISI(saisie.fichier));
    nomme.className = "mono fichier";
    lineCle.append(nomme);
  }
  if (saisie.erreurCle !== undefined) lineCle.append(errorSous(doc, saisie.erreurCle));

  const actionsDuRole = cree(doc, "div");
  actionsDuRole.className = "gestes-du-role";
  actionsDuRole.append(buttonAction(doc, CHOISIR, () => fichier.click()));
  // Tant que la station range, le contrôle attend.
  id.disabled = saisie.enCours;
  cle.disabled = saisie.enCours;
  return [lineId, lineCle, actionsDuRole];
}

// L'écran : la ligne d'en-tête — où les clés restent —, puis une ligne par rôle.
/** @param {Fabrique} doc @param {StateDesIdentities} state @param {ActionsDesIdentities} actions */
export function poserLesIdentities(doc, state, actions) {
  const racine = cree(doc, "div");
  racine.className = "apps-github";
  racine.ariaLive = "polite";
  const guard = cree(doc, "span", GUARD);
  guard.className = "garde";
  const lue = state.lecture;
  const tete = rangeeDeSetting(doc, { nom: TITRE, valeur: [guard, survol(doc, AIDE)], controle: lue !== undefined && "refus" in lue ? [lineError(doc, ILLISIBLE, lue.refus)] : [], classe: "tete" });
  racine.append(tete);
  for (const role of ROLES) {
    const saisie = state.saisies[role];
    // Ce que le dernier changement a rendu, sous la ligne : le rangement en route, l'App rangée, ou le refus.
    /** @type {import("./composants/setting/setting.js").Dit | undefined} */
    let dit;
    if (saisie.enCours) dit = { enCours: ENREGISTREMENT };
    else if (saisie.refus !== undefined) dit = { refus: saisie.refus.ligne, detail: saisie.refus.detail };
    else if (saisie.attendCle === true) dit = { enCours: CLE_ATTENDUE };
    else if (saisie.rangee) dit = { fait: RANGEE };
    const line = rangeeDeSetting(doc, { nom: NAME(role), valeur: stateDuRole(doc, lue, role), controle: formulaire(doc, role, saisie, actions), dessous: ditDuSetting(doc, dit) });
    line.dataset.role = role;
    racine.append(line);
  }
  return racine;
}
