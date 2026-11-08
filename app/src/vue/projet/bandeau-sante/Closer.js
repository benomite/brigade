// @ts-check
// Le closer, sur Kitchen > Health (ticket 2491, épique 2484) : ce qu'il a fait — ses passes, et ce que chacune a retiré —,
// ce qu'il vérifie en premier sur ce projet, ce que le chef lui demande de vérifier en plus, et ses réglages — son
// calibrage, sa condition de départ, ses plafonds. Tout vient du dépôt du projet, sur GitHub (closer-sante.ts) : une
// passe est une issue de fermeture, ce qu'elle a retiré est sa PR mergée ; ce qu'il vérifie en premier, ce que la
// dernière passe lui a remis ; ses vérifications en plus, `.claude/brigade/closer-checks.md` ; ses réglages, `closer.*`
// de `.claude/brigade/projet.json`. Chaque réglage est une rangée de réglage (composants/reglage, ticket 2920) — un
// réglage chiffré, celle d'un plafond de durée (PlafondsDuree.js) : son nom, sa valeur en vigueur et d'où elle vient, un
// contrôle qui s'applique dès qu'il change, sans « save » ; gardé dans le dépôt, il s'y propose par une pull request, et
// sa rangée le dit. Ce module ne touche pas `document` : il reçoit de quoi créer un élément.

import { boutonAction, replie, survol } from "../../briques.js";
import { ligneErreur } from "../../composants/ligne-erreur/ligne-erreur.js";
import { ditDuPlafond, EN_COURS, poserUnPlafond } from "./PlafondsDuree.js";
import { ditDuReglage, PAR_PR, rangeeDeReglage } from "../../composants/reglage/reglage.js";
import { bouton as boutonDeLaFamille } from "../../composants/bouton/bouton.js";
import { ligneVide } from "../../composants/ligne-vide/ligne-vide.js";

/** @typedef {import("../../briques.js").Fabrique} Fabrique */
/** @typedef {import("../../../closer-sante.ts").LectureDuCloser} Lecture */
/** @typedef {import("../../../closer-sante.ts").PasseLue} Passe */
/** @typedef {import("../../../closer-sante.ts").ReglageLu} Reglage */
/** @typedef {import("../../../closer-sante.ts").Calibrage} Calibrage */
/** @typedef {import("./PlafondsDuree.js").Etat} Etat */
// Ce que le chef tape dans le champ d'une vérification, l'écriture en cours, ce qu'elle a rendu.
// La PR ouverte dit la vérification qu'elle ajoute ou retire.
/** @typedef {{ pr: string, numero: number, geste: "ajouter" | "retirer", verification: string } | { fait: string } | { refus: string, detail?: string }} DitDesVerifications */
/** @typedef {{ saisie?: string, enCours?: string, dit?: DitDesVerifications }} EtatDesVerifications */

export const TITRE = "Closer";
export const AIDE =
  "The closer prunes what the project no longer needs — dead code, duplicates. After 20 merges since its last pass, at most once a day, a station opens a closing issue; a cook cooks it and the pass merges its PR.";
export const FAIT = "What it did";
export const EN_PREMIER = "What it checks first";
export const EN_PLUS = "Extra checks";
export const REGLAGES = "Settings";
export const REGLAGES_AIDE =
  "Kept in the project's repository (.claude/brigade/projet.json): a change here opens a pull request on its integration branch, and the station applies it once merged, at its next fetch. Empty, the setting's removal is proposed.";
export const SANS_PASSE = "No closing pass yet on this project";
export const SANS_PASSE_POURQUOI = "A station opens one once the closer is calibrated and 20 merges reached the integration branch since the last pass.";
export const SES_VERIFICATIONS = "At each pass: the dead code and the duplicates of the base, the drift of the latest merges, and the ticket times.";
export const EN_PLUS_AIDE =
  "Kept in the project's repository (.claude/brigade/closer-checks.md): adding or removing one here opens a pull request on its integration branch, and the list changes once merged. The runtime does not copy them into a pass's issue yet: they wait in the repository until it does.";
export const AJOUTER = { libelle: "add", enCours: "adding…", survol: "opens a pull request that adds it to .claude/brigade/closer-checks.md, towards the project's integration branch, on GitHub", invite: "e.g. unused CSS classes in app/src/vue/vue.css" };
export const RETIRER = { libelle: "remove", enCours: "removing…" };
export const PAS_SUR_GITHUB = "not read on GitHub yet";
export const PAS_SUR_GITHUB_POURQUOI = "The closer on GitHub reads only its calibration and its removed lines cap: this setting is kept in the repository, and applies once the runtime reads it there.";
export const DEPART = "The pass leaves when fewer cooks than this are in flight: 1, when none is.";
export const CHOISIR_MODELE = "model…";
export const CHOISIR_EFFORT = "effort…";

/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}
const nombre = (/** @type {number} */ n) => n.toLocaleString("en-US");
const s = (/** @type {number} */ n) => (n > 1 ? "s" : "");
/** @param {string} iso */
const jour = (iso) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

// Un lien vers GitHub : un bouton qui l'ouvre dans le navigateur du poste, l'adresse au survol.
/** @param {Fabrique} doc @param {string} texte @param {string} url @param {(url: string) => void} ouvrir */
function lien(doc, texte, url, ouvrir) {
  if (!/^https:\/\//.test(url)) {
    const sans = cree(doc, "span", texte);
    sans.className = "mono";
    return sans;
  }
  const bouton = boutonDeLaFamille(doc, texte, () => ouvrir(url), { sorte: "discret" });
  bouton.className = "lien mono";
  bouton.title = `open ${url} in your browser`;
  return bouton;
}

/** @param {Fabrique} doc @param {string} titre @param {string} [aide] */
function partie(doc, titre, aide) {
  const pose = cree(doc, "div");
  pose.className = "closer-partie";
  const tete = cree(doc, "h4", titre);
  if (aide !== undefined) tete.append(survol(doc, aide));
  pose.append(tete);
  return pose;
}

// --- Ce qu'il a fait -----------------------------------------------------------------

// Ce qu'une passe a retiré, en une ligne : les lignes de sa PR mergée ; rien, sinon — et pourquoi, en mots.
/** @param {Passe} passe */
export function ceQuElleARetire(passe) {
  const { pr } = passe;
  if (pr?.mergee === true) return { retire: true, dit: `−${nombre(pr.retirees)} line${s(pr.retirees)}`, precise: `+${nombre(pr.ajoutees)} added` };
  if (passe.ouverte) return { retire: false, dit: pr === null ? "in progress — not cooked yet" : "in progress — its PR is in the pass", precise: "" };
  return { retire: false, dit: "nothing removed", precise: pr === null ? "closed with no PR" : "its PR was closed without a merge" };
}

/** @param {Fabrique} doc @param {Passe} passe @param {(url: string) => void} ouvrir */
function ligneDePasse(doc, passe, ouvrir) {
  const rangee = cree(doc, "div");
  rangee.className = "passe";
  rangee.dataset.passe = String(passe.numero);
  const qui = cree(doc, "p");
  qui.className = "qui";
  qui.append(lien(doc, `#${passe.numero}`, passe.url, ouvrir), cree(doc, "small", jour(passe.ouverteLe)));
  const retire = ceQuElleARetire(passe);
  const quoi = retire.retire ? cree(doc, "p") : ligneVide(doc, "", { classe: "retire sans" });
  if (retire.retire) quoi.className = "retire";
  const dit = cree(doc, "strong", retire.dit);
  if (retire.retire) dit.className = "mono";
  quoi.append(dit);
  if (retire.precise !== "") quoi.append(cree(doc, "small", retire.precise));
  const sur = cree(doc, "p");
  sur.className = "sur";
  const total = passe.candidats.length + passe.restants;
  sur.append(cree(doc, "small", total === 0 ? "no candidate" : `${total} candidate${s(total)}`));
  if (passe.pr !== null) sur.append(lien(doc, `PR #${passe.pr.numero}`, passe.pr.url, ouvrir));
  rangee.append(qui, quoi, sur);
  return rangee;
}

/** @param {Fabrique} doc @param {Lecture["passes"] | undefined} passes @param {(url: string) => void} ouvrir */
function ceQuIlAFait(doc, passes, ouvrir) {
  const pose = partie(doc, FAIT);
  pose.dataset.partie = "passes";
  if (passes === undefined) pose.append(cree(doc, "p", "reading the closer's passes…"));
  else if ("sans" in passes) pose.append(ligneErreur(doc, passes.sans, passes.detail ?? ""));
  else if (passes.liste.length === 0) {
    const vide = ligneVide(doc, SANS_PASSE, { classe: "sans" });
    vide.append(survol(doc, SANS_PASSE_POURQUOI));
    pose.append(vide);
  } else pose.append(...passes.liste.map((passe) => ligneDePasse(doc, passe, ouvrir)));
  return pose;
}

// --- Ce qu'il vérifie en premier -----------------------------------------------------

// Les temps des tickets, tels que la passe les a relevés : stables, une dérive et son ticket de correction, ou non lus.
/** @param {readonly string[]} temps */
function lesTemps(temps) {
  const premier = temps[0];
  if (premier === undefined || /^Times not read/.test(premier)) return "not read at this pass";
  if (/^Times stable/.test(premier)) return "stable since the previous pass";
  const correction = /Correction ticket #(\d+)/.exec(temps.join(" "))?.[1];
  return `a drift found${correction === undefined ? "" : ` — correction ticket #${correction}`}`;
}

// Ce que la dernière passe lui a remis, une ligne par vérification : son nom, ce qu'elle a trouvé sur ce projet.
/** @param {Passe} passe */
export function sesVerifications(passe) {
  const morts = passe.candidats.filter(({ id }) => id.startsWith("M")).length;
  const doublons = passe.candidats.filter(({ id }) => id.startsWith("D")).length;
  const derive = passe.derive.at(-1);
  return [
    { nom: "Dead code", dit: morts === 0 ? "none spotted" : `${morts} export${s(morts)} referenced nowhere, or by tests only`, survol: "" },
    { nom: "Duplicates", dit: doublons === 0 ? "none spotted" : `${doublons} passage${s(doublons)} of identical lines`, survol: "" },
    { nom: "Drift", dit: derive ?? "no merge read", survol: passe.derive.slice(0, -1).join(" · ") },
    { nom: "Ticket times", dit: lesTemps(passe.temps), survol: passe.temps.join(" ") },
  ];
}

/** @param {Fabrique} doc @param {Lecture["passes"] | undefined} passes @param {{ ouverts: boolean, basculer?: (ouvert: boolean) => void }} replis */
function ceQuIlVerifie(doc, passes, { ouverts, basculer }) {
  const pose = partie(doc, EN_PREMIER, SES_VERIFICATIONS);
  pose.dataset.partie = "en-premier";
  const derniere = passes !== undefined && !("sans" in passes) ? passes.liste[0] : undefined;
  if (derniere === undefined) {
    const dit = ligneVide(doc, passes === undefined ? "reading…" : "its own checks — dead code, duplicates, drift, ticket times — once a pass is opened", { classe: "sans" });
    pose.append(dit);
    return pose;
  }
  for (const { nom, dit, survol: detail } of sesVerifications(derniere)) {
    const rangee = cree(doc, "p");
    rangee.className = "verification";
    const appele = cree(doc, "span", nom);
    appele.className = "nom";
    rangee.append(appele, cree(doc, "span", dit));
    if (detail !== "") rangee.append(survol(doc, detail));
    pose.append(rangee);
  }
  const total = derniere.candidats.length;
  if (total > 0) {
    const liste = cree(doc, "ol");
    liste.className = "candidats";
    for (const { id, quoi } of derniere.candidats) {
      const item = cree(doc, "li");
      const nom = cree(doc, "span", id);
      nom.className = "nom mono";
      item.append(nom, cree(doc, "span", quoi.replace(/`/g, "")));
      liste.append(item);
    }
    const resume = `${total} handed to pass #${derniere.numero}${derniere.sha === "" ? "" : ` on ${derniere.sha.slice(0, 7)}`}${derniere.restants === 0 ? "" : ` · ${derniere.restants} more left for the next`}`;
    pose.append(replie(doc, { titre: "Candidates", resume, ouvert: ouverts, ...(basculer === undefined ? {} : { basculer }) }, [liste]));
  }
  return pose;
}

// --- Ce qu'il vérifie en plus --------------------------------------------------------

// Ce que le dernier geste a rendu, sous le champ (composants/reglage) : en route, la PR ouverte — la vérification qu'elle
// ajoute ou retire —, la liste déjà telle quelle, ou le refus.
/** @param {Fabrique} doc @param {EtatDesVerifications} etat @param {(url: string) => void} ouvrir */
function rendu(doc, etat, ouvrir) {
  if (etat.enCours !== undefined) return ditDuReglage(doc, { enCours: EN_COURS });
  const dit = etat.dit;
  if (dit !== undefined && "pr" in dit) {
    const valeur = dit.geste === "ajouter" ? `the check “${dit.verification}”` : `the removal of “${dit.verification}”`;
    return ditDuReglage(doc, { pr: dit.pr, numero: dit.numero, valeur }, { ouvrir });
  }
  return ditDuReglage(doc, dit);
}

/**
 * @param {Fabrique} doc @param {Lecture["verifications"] | undefined} verifications @param {EtatDesVerifications} etat
 * @param {{ taper: (saisie: string) => void, changer: (geste: "ajouter" | "retirer", saisie: string) => void, ouvrir: (url: string) => void }} gestes
 */
function ceQuIlVerifieEnPlus(doc, verifications, etat, { taper, changer, ouvrir }) {
  const pose = partie(doc, EN_PLUS, EN_PLUS_AIDE);
  pose.dataset.partie = "en-plus";
  if (verifications === undefined) {
    pose.append(cree(doc, "p", "reading the extra checks…"));
    return pose;
  }
  if ("sans" in verifications) {
    pose.append(ligneErreur(doc, verifications.sans, verifications.detail ?? ""));
    return pose;
  }
  const occupe = etat.enCours !== undefined;
  if (verifications.liste.length === 0) {
    const vide = ligneVide(doc, "none yet: the closer checks only its own", { classe: "sans" });
    pose.append(vide);
  } else {
    const liste = cree(doc, "ul");
    liste.className = "en-plus";
    for (const verification of verifications.liste) {
      const item = cree(doc, "li");
      const retire = etat.enCours === `retirer:${verification}`;
      const bouton = boutonAction(doc, retire ? RETIRER.enCours : RETIRER.libelle, () => {
        if (!occupe) changer("retirer", verification);
      });
      bouton.className = "action retirer-la-verification";
      /** @type {any} */
      const clic = bouton.children[0];
      if (clic !== undefined) clic.disabled = occupe;
      item.append(cree(doc, "span", verification), bouton);
      liste.append(item);
    }
    pose.append(liste);
  }
  let saisie = etat.saisie ?? "";
  const champ = cree(doc, "p");
  champ.className = "champ ajouter";
  const entree = cree(doc, "input");
  entree.type = "text";
  entree.ariaLabel = "a check to add";
  entree.placeholder = AJOUTER.invite;
  entree.spellcheck = false;
  entree.value = saisie;
  entree.disabled = occupe;
  const ajoute = etat.enCours === "ajouter";
  const bouton = boutonAction(
    doc,
    ajoute ? AJOUTER.enCours : AJOUTER.libelle,
    () => {
      if (saisie.trim() !== "") changer("ajouter", saisie.trim());
    },
    { recommande: true },
  );
  bouton.className = "action ajouter-la-verification";
  /** @type {any} */
  const clic = bouton.children[0];
  const suivre = () => {
    if (clic !== undefined) clic.disabled = occupe || saisie.trim() === "";
  };
  if (clic !== undefined) clic.title = AJOUTER.survol;
  entree.addEventListener("input", () => {
    saisie = entree.value;
    taper(entree.value);
    suivre();
  });
  entree.addEventListener("keydown", (/** @type {{ key?: string }} */ evenement) => {
    if (evenement.key === "Enter" && !occupe && saisie.trim() !== "") changer("ajouter", saisie.trim());
  });
  suivre();
  champ.append(entree, bouton);
  // Gardées dans le dépôt : la partie le dit comme une rangée de réglage, sous son champ.
  const parPr = cree(doc, "p", PAR_PR);
  parPr.className = "par-pr";
  pose.append(champ, parPr, ...rendu(doc, etat, ouvrir));
  return pose;
}

// --- Ses réglages ----------------------------------------------------------------------

// Le calibrage : le modèle et l'effort, choisis ensemble — vides tous deux, le dépôt n'en dit plus rien. Il s'applique
// au `change` d'une liste, dès que les deux disent un calibrage autre que celui en vigueur ; l'un sans l'autre attend.
/**
 * @param {Fabrique} doc
 * @param {{ reglage: Reglage, etat: Etat | undefined, valeurs: { modeles: readonly string[], efforts: readonly string[] }, choisir: (choisi: string) => void, changer: (calibrage: Calibrage) => void, ouvrir?: (url: string) => void }} options
 */
function ligneDuCalibrage(doc, { reglage, etat, valeurs, choisir, changer, ouvrir }) {
  const lu = /** @type {Calibrage | null} */ (reglage.valeur);
  const dite = cree(doc, "strong", lu === null ? "not set" : `${lu.model} / ${lu.effort}`);
  dite.className = "mono";
  const source = cree(doc, "small", lu === null ? "the station's, if any" : "in the repository");
  source.className = "source";
  const occupe = etat?.enCours === true;
  const [modeleChoisi, effortChoisi] = etat?.choisi === undefined ? [lu?.model ?? "", lu?.effort ?? ""] : etat.choisi.split(" ");
  /** @param {string} invite @param {readonly string[]} liste @param {string} choisie */
  const choix = (invite, liste, choisie) => {
    const pose = cree(doc, "select");
    pose.ariaLabel = `the closer's ${invite.replace("…", "")}`;
    for (const [texte, v] of [[invite, ""], ...liste.map((x) => [x, x])]) {
      const option = cree(doc, "option", texte);
      option.value = v;
      pose.append(option);
    }
    pose.value = liste.includes(choisie) ? choisie : "";
    pose.disabled = occupe;
    return pose;
  };
  const modele = choix(CHOISIR_MODELE, valeurs.modeles, modeleChoisi ?? "");
  const effort = choix(CHOISIR_EFFORT, valeurs.efforts, effortChoisi ?? "");
  const change = () => {
    const m = modele.value;
    const e = effort.value;
    if ((m === "") !== (e === "")) return false;
    return lu === null ? m !== "" : m !== lu.model || e !== lu.effort;
  };
  for (const liste of [modele, effort]) {
    liste.addEventListener("change", () => {
      choisir(`${modele.value} ${effort.value}`);
      if (!occupe && change()) changer({ model: modele.value, effort: effort.value });
    });
  }
  return rangeeDeReglage(doc, {
    nom: reglage.nom,
    cle: reglage.cle,
    valeur: [dite, source],
    controle: [modele, effort, survol(doc, "Both chosen together: one without the other makes the start be refused, and is not proposed. Both emptied, the setting's removal is proposed.")],
    depot: true,
    dessous: ditDuPlafond(doc, etat, (valeur) => `${valeur.model} / ${valeur.effort}`, ouvrir),
  });
}

// Les réglages : le calibrage, puis les trois nombres, chacun comme un plafond de durée. Celui que le closer sur GitHub
// ne lit pas encore le dit, la raison au survol.
/**
 * @param {Fabrique} doc @param {Lecture["reglages"] | undefined} reglages
 * @param {{ etats: ReadonlyMap<string, Etat>, valeurs: { modeles: readonly string[], efforts: readonly string[] }, choisir: (cle: string, choisi: string) => void, changer: (cle: string, saisie: string | Calibrage) => void, ouvrir: (url: string) => void }} options
 */
function sesReglages(doc, reglages, { etats, valeurs, choisir, changer, ouvrir }) {
  const pose = partie(doc, REGLAGES, REGLAGES_AIDE);
  pose.dataset.partie = "reglages";
  if (reglages === undefined) {
    pose.append(cree(doc, "p", "reading the closer's settings…"));
    return pose;
  }
  if ("sans" in reglages) {
    pose.append(ligneErreur(doc, reglages.sans, reglages.detail ?? ""));
    return pose;
  }
  for (const reglage of reglages.liste) {
    const etat = etats.get(reglage.cle);
    if (reglage.cle === "calibration") {
      pose.append(ligneDuCalibrage(doc, { reglage, etat, valeurs, choisir: (choisi) => choisir(reglage.cle, choisi), changer: (calibrage) => changer(reglage.cle, calibrage), ouvrir }));
      continue;
    }
    const plafond = /** @type {any} */ ({ cle: reglage.cle, nom: reglage.nom, unite: reglage.unite, entier: true, duree: false, defaut: reglage.defaut, valeur: reglage.valeur });
    const rangee = poserUnPlafond(doc, { plafond, etat, choisir: (choisi) => choisir(reglage.cle, choisi), changer: (saisie) => changer(reglage.cle, saisie), ouvrir });
    // La condition de départ se lit en cooks en vol : « 1 », c'est aucun.
    if (reglage.cle === "cooksBelow") {
      const [dite, source] = rangee.children[1]?.children ?? [];
      const n = /** @type {number | null} */ (reglage.valeur);
      if (dite !== undefined && n !== null) dite.textContent = n === 1 ? "none in flight" : `fewer than ${nombre(n)} in flight`;
      if (source !== undefined && n === null) source.textContent = "the station's, or none in flight";
      rangee.children[0]?.append(survol(doc, DEPART));
    }
    if (!reglage.surGithub) {
      const note = cree(doc, "small", PAS_SUR_GITHUB);
      note.className = "pas-sur-github";
      rangee.children[1]?.append(note, survol(doc, PAS_SUR_GITHUB_POURQUOI));
    }
    pose.append(rangee);
  }
  return pose;
}

// --- Le bloc -----------------------------------------------------------------------------

// Le bloc entier. `lecture` indéfinie : la première lecture est en route ; chaque partie dit la sienne. `ouvrir` ouvre
// une passe ou sa PR ; `ouvrirLaPr`, la PR qu'un réglage changé a ouverte.
/**
 * @param {Fabrique} doc
 * @param {{ lecture?: Lecture, etats?: ReadonlyMap<string, Etat>, verifications?: EtatDesVerifications, valeurs?: { modeles: readonly string[], efforts: readonly string[] }, candidatsOuverts?: boolean, basculerCandidats?: (ouvert: boolean) => void, ouvrir?: (url: string) => void, ouvrirLaPr?: (url: string) => void, choisir?: (cle: string, choisi: string) => void, changer?: (cle: string, saisie: string | Calibrage) => void, taper?: (saisie: string) => void, changerVerification?: (geste: "ajouter" | "retirer", saisie: string) => void }} [options]
 */
export function poserBlocCloser(doc, { lecture, etats = new Map(), verifications = {}, valeurs = { modeles: [], efforts: [] }, candidatsOuverts = false, basculerCandidats, ouvrir = () => {}, ouvrirLaPr = ouvrir, choisir = () => {}, changer = () => {}, taper = () => {}, changerVerification = () => {} } = {}) {
  const bloc = doc.createElement("section");
  bloc.className = "bloc-du-projet";
  bloc.dataset.bloc = "closer";
  bloc.ariaLabel = TITRE;
  const titre = doc.createElement("h3");
  titre.textContent = TITRE;
  titre.append(survol(doc, AIDE));
  bloc.append(
    titre,
    ceQuIlAFait(doc, lecture?.passes, ouvrir),
    ceQuIlVerifie(doc, lecture?.passes, { ouverts: candidatsOuverts, ...(basculerCandidats === undefined ? {} : { basculer: basculerCandidats }) }),
    ceQuIlVerifieEnPlus(doc, lecture?.verifications, verifications, { taper, changer: changerVerification, ouvrir: ouvrirLaPr }),
    sesReglages(doc, lecture?.reglages, { etats, valeurs, choisir, changer, ouvrir: ouvrirLaPr }),
  );
  return bloc;
}
