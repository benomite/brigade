// @ts-check
// La partie « closer » de la page d'un projet (le ticket 990, épique 986) : ce que la dernière
// observation du closer a repéré, lue dans `closing --json` (docs/runtime/fermeture.md, « La même
// lecture, pour l'app »). En tête, quatre chiffres — les merges depuis le dernier nettoyage, le
// rapport des lignes ajoutées aux lignes retirées, les doublons, les exports morts —, puis la liste de
// ce qui a été repéré, repliée derrière un bouton : chaque trouvaille avec son fichier et ses lignes.
// Sans closer réglé, la partie le dit, et donne le geste qui en règle un — aucun chiffre.
//
// Deux places, vides ici et séparées du reste, attendent ce que les tickets suivants y posent : le
// lancement d'un nettoyage et l'état de sa demande (`closer-lancement`), puis le bilan d'une passe
// finie (`closer-bilan`). Celui qui appelle y met ses éléments ; sans eux, elles restent vides.
//
// L'app ne recompte rien : chaque chiffre est celui que la box écrit. Ce module ne touche pas
// `document` : il reçoit de quoi créer un élément (briques.js), et rend des éléments.

import { lectureIndisponible, survol } from "../briques.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("../../box.ts").Lecture} Lecture */

// Ce que l'app lit de `closing --json` — la forme que runtime/src/fermeture-lecture/lecture.ts
// écrit, réduite à ce que la partie pose.
/**
 * @typedef {{ window: number, merges: number, added: number, removed: number, ratio: number | null, reads: string }} Fenetre
 * @typedef {{ readable: true, ref: string, mergesSinceCleanup: number, ratio: Fenetre[], duplicates: number, deadExports: number }
 *   | { readable: false, error: string, mergesSinceCleanup: number }} Observation
 * @typedef {{ id: string, kind: "duplicate", file: string, start: number, end: number, lines: number, copy: { file: string, start: number, end: number } }
 *   | { id: string, kind: "dead-export", file: string, start: number, end: number, name: string, onlyTests: string[] }} Trouvaille
 * @typedef {{ configured: false, text: string }
 *   | { configured: true, closer: { model: string, effort: string }, observation: Observation, findings: Trouvaille[] }} Fermeture
 * @typedef {{ fermeture: Fermeture } | { erreur: string }} Lu
 */

export const COMMANDE = "closing --json";
export const TITRE = "closer";
export const MERGES = "merges since last cleanup";
export const RATIO = "added / removed";
export const DOUBLONS = "duplicates";
export const MORTS = "dead exports";
export const LECTURE = "reading…";
export const NON_COMMUNIQUE = "not communicated";
export const ILLISIBLE = "the closer could not be read";
export const BRANCHE_ILLISIBLE = "the integration branch could not be read";
export const SANS_CLOSER = "No closer is set on this project.";
export const POUR_EN_REGLER = "Set one from a terminal, with these two commands:";
export const AUCUNE = "nothing found";
// Les deux gestes de docs/runtime/fermeture.md, « Le closer se règle, ou il n'y en a pas » : ce qui suit `brigade <projet>`.
export const GESTES_DE_REGLAGE = ["station closer-modele <model>", "station closer-effort <effort>"];

const nombre = (/** @type {number} */ valeur) => valeur.toLocaleString("en-US");
const s = (/** @type {number} */ combien) => (combien > 1 ? "s" : "");

// Chaque classe est posée en clair, `className = "…"` : la peau ne vise que des classes que la vue
// pose, et son test les lit ainsi (peau.test.ts).
/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

// --- La lecture --------------------------------------------------------------------

/** @param {unknown} lu @returns {lu is Fermeture} */
function estUneFermeture(lu) {
  if (lu === null || typeof lu !== "object" || Array.isArray(lu)) return false;
  const objet = /** @type {Record<string, unknown>} */ (lu);
  if (objet.configured === false) return true;
  if (objet.configured !== true) return false;
  const observation = /** @type {Record<string, unknown> | null} */ (objet.observation);
  return observation !== null && typeof observation === "object" && typeof observation.mergesSinceCleanup === "number" && Array.isArray(objet.findings);
}

// Ce que la lecture de l'onglet a rendu, pour la partie : l'objet de `closing --json` — sa dernière
// ligne qui en est un —, ou pourquoi il n'y en a pas. Une lecture ratée garde ce que l'app a obtenu,
// pour le survol.
/** @param {Lecture} recue @returns {Lu} */
export function lireFermeture(recue) {
  if ("erreur" in recue) return { erreur: recue.erreur };
  const texte = recue.sorties.find(({ commande }) => commande === COMMANDE)?.texte ?? "";
  for (const ligne of texte.split("\n").reverse()) {
    try {
      const lu = JSON.parse(ligne);
      if (estUneFermeture(lu)) return { fermeture: lu };
    } catch {
      // Pas un objet : une autre ligne de la sortie.
    }
  }
  return { erreur: texte.trim() === "" ? `\`${COMMANDE}\` returned nothing` : `\`${COMMANDE}\` did not return the closer's reading: ${texte.trim()}` };
}

// --- Les chiffres ------------------------------------------------------------------

// Un chiffre : son libellé, sa valeur, et ce qui la précise dessous, s'il y a lieu.
/** @param {Fabrique} doc @param {string} libelle @param {string} valeur @param {string} [precise] */
function chiffre(doc, libelle, valeur, precise = "") {
  const pose = cree(doc, "div");
  pose.className = "chiffre";
  const total = cree(doc, "p", valeur);
  total.className = valeur === NON_COMMUNIQUE ? "total sans" : "total";
  pose.append(cree(doc, "h3", libelle), total);
  if (precise !== "") {
    const dessous = cree(doc, "p", precise);
    dessous.className = "precise";
    pose.append(dessous);
  }
  return pose;
}

// Le rapport, sur la plus longue fenêtre de l'observation : celle que l'épique cite (« 2,5 pour 1 sur
// les 100 derniers merges »). Ses mots sont ceux de `closing` (`reads` : « 2.5:1 », « nothing removed »).
/** @param {Fabrique} doc @param {Fenetre[]} fenetres */
function rapport(doc, fenetres) {
  const fenetre = fenetres.at(-1);
  if (fenetre === undefined || fenetre.merges === 0) return chiffre(doc, RATIO, fenetre === undefined ? NON_COMMUNIQUE : "no merge yet");
  return chiffre(doc, RATIO, fenetre.reads, `+${nombre(fenetre.added)} / −${nombre(fenetre.removed)} · last ${fenetre.merges} merge${s(fenetre.merges)}`);
}

// Les quatre chiffres. Une branche illisible n'en garde qu'un, que le journal tient seul : les
// merges ; les trois autres ne sont pas communiqués, et la ligne dessous dit pourquoi, le détail au survol.
/** @param {Fabrique} doc @param {Observation} observation */
function chiffres(doc, observation) {
  const ligne = cree(doc, "div");
  ligne.className = "chiffres";
  const merges = chiffre(doc, MERGES, nombre(observation.mergesSinceCleanup));
  if (!observation.readable) {
    ligne.append(merges, chiffre(doc, RATIO, NON_COMMUNIQUE), chiffre(doc, DOUBLONS, NON_COMMUNIQUE), chiffre(doc, MORTS, NON_COMMUNIQUE));
    return [ligne, lectureIndisponible(doc, BRANCHE_ILLISIBLE, observation.error)];
  }
  ligne.append(merges, rapport(doc, observation.ratio), chiffre(doc, DOUBLONS, nombre(observation.duplicates)), chiffre(doc, MORTS, nombre(observation.deadExports)));
  return [ligne];
}

// --- Les trouvailles ---------------------------------------------------------------

// Un passage, comme `closing` l'écrit : `chemin:début-fin`, ou `chemin:ligne` quand il n'en tient qu'une.
const passage = (/** @type {{ file: string, start: number, end: number }} */ { file, start, end }) => `${file}:${start === end ? start : `${start}-${end}`}`;

/** @param {Fabrique} doc @param {Trouvaille} trouvaille */
function ligneDeTrouvaille(doc, trouvaille) {
  const item = cree(doc, "li");
  const nom = cree(doc, "span", trouvaille.id);
  nom.className = "nom mono";
  const ou = cree(doc, "span", passage(trouvaille));
  ou.className = "ou mono";
  const quoi = cree(doc, "span");
  quoi.className = "quoi";
  if (trouvaille.kind === "duplicate") {
    quoi.append(`${trouvaille.lines} line${s(trouvaille.lines)} also at `);
    const copie = cree(doc, "span", passage(trouvaille.copy));
    copie.className = "mono";
    quoi.append(copie);
  } else {
    quoi.append("export ");
    const nomme = cree(doc, "span", trouvaille.name);
    nomme.className = "mono";
    quoi.append(nomme, trouvaille.onlyTests.length === 0 ? " named nowhere else" : " named by tests only");
  }
  item.append(nom, ou, quoi);
  return item;
}

// Le bouton qui déplie la liste, et la liste quand elle l'est. `ouvert` dit si elle l'est,
// `basculer` la déplie ou la replie. Rien de repéré : une ligne le dit, et il n'y a rien à déplier.
/** @param {Fabrique} doc @param {Trouvaille[]} trouvailles @param {boolean} ouvert @param {() => void} basculer */
function lesTrouvailles(doc, trouvailles, ouvert, basculer) {
  const bloc = cree(doc, "div");
  bloc.className = "closer-trouvailles";
  if (trouvailles.length === 0) {
    const vide = cree(doc, "p", AUCUNE);
    vide.className = "sans";
    bloc.append(vide);
    return bloc;
  }
  const bouton = cree(doc, "button", `${ouvert ? "hide" : "show"} what was found (${trouvailles.length})`);
  bouton.type = "button";
  bouton.className = "deplier";
  bouton.ariaExpanded = String(ouvert);
  bouton.addEventListener("click", basculer);
  bloc.append(bouton);
  if (!ouvert) return bloc;
  const liste = cree(doc, "ol");
  liste.className = "trouvailles";
  liste.append(...trouvailles.map((trouvaille) => ligneDeTrouvaille(doc, trouvaille)));
  bloc.append(liste);
  return bloc;
}

// --- Sans closer -------------------------------------------------------------------

// Le message, puis le geste exact, pour ce projet : deux commandes, chacune sur sa ligne et
// sélectionnable. Les valeurs acceptées sont au survol, quand l'app les connaît.
/** @param {Fabrique} doc @param {(suite: string) => string} geste @param {{ modeles: readonly string[], efforts: readonly string[] } | undefined} valeurs */
function sansCloser(doc, geste, valeurs) {
  const bloc = cree(doc, "div");
  bloc.className = "closer-sans";
  const dit = cree(doc, "p", SANS_CLOSER);
  dit.className = "attendu";
  const comment = cree(doc, "p", POUR_EN_REGLER);
  comment.className = "comment";
  const acceptees = valeurs === undefined || valeurs.modeles.length === 0 ? "" : `<model>: ${valeurs.modeles.join(", ")} · <effort>: ${valeurs.efforts.join(", ")} — both are needed, and take effect without a restart`;
  if (acceptees !== "") comment.append(survol(doc, acceptees));
  const gestes = cree(doc, "div");
  gestes.className = "gestes-closer";
  gestes.append(...GESTES_DE_REGLAGE.map((suite) => cree(doc, "code", geste(suite))));
  bloc.append(dit, comment, gestes);
  return bloc;
}

// --- La partie ---------------------------------------------------------------------

/**
 * @typedef {object} Options
 * @property {(suite: string) => string} geste  une commande du runtime dans sa forme de poste, pour ce projet
 * @property {boolean} [ouvert]  la liste des trouvailles est dépliée
 * @property {() => void} [basculer]  la déplie ou la replie
 * @property {{ modeles: readonly string[], efforts: readonly string[] }} [valeurs]  le calibrage que la station accepte
 * @property {any[]} [lancement]  ce qui se pose à la place du lancement et de l'état de la demande
 * @property {any[]} [bilan]  ce qui se pose à la place du bilan
 */

// La partie entière. `lu` indéfini : la première lecture est en route.
/** @param {Fabrique} doc @param {Lu | undefined} lu @param {Options} options */
export function poserCloser(doc, lu, { geste, ouvert = false, basculer = () => {}, valeurs, lancement = [], bilan = [] }) {
  const tete = cree(doc, "div");
  tete.className = "tete-closer";
  const titre = cree(doc, "h2", TITRE);
  tete.append(titre);
  if (lu === undefined) {
    const lecture = cree(doc, "p", LECTURE);
    lecture.className = "sans";
    tete.append(lecture);
    return [tete];
  }
  if ("erreur" in lu) {
    tete.append(lectureIndisponible(doc, ILLISIBLE, lu.erreur));
    return [tete];
  }
  const { fermeture } = lu;
  if (!fermeture.configured) {
    tete.append(sansCloser(doc, geste, valeurs));
    return [tete];
  }
  const calibrage = cree(doc, "span", `${fermeture.closer.model} / ${fermeture.closer.effort}`);
  calibrage.className = "calibrage mono";
  titre.append(" ", calibrage);
  tete.append(...chiffres(doc, fermeture.observation));
  const placeDuLancement = cree(doc, "div");
  placeDuLancement.className = "closer-lancement";
  placeDuLancement.append(...lancement);
  const placeDuBilan = cree(doc, "div");
  placeDuBilan.className = "closer-bilan";
  placeDuBilan.append(...bilan);
  // Une branche illisible n'a rien repéré : il n'y a pas de liste à proposer, ni à dire vide.
  const trouvailles = fermeture.observation.readable ? [lesTrouvailles(doc, fermeture.findings, ouvert, basculer)] : [];
  return [tete, ...trouvailles, placeDuLancement, placeDuBilan];
}
