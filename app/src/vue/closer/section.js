// @ts-check
// La partie « closer » de la page d'un projet (le ticket 990, épique 986) : ce que la dernière
// observation du closer a repéré, lue dans `closing --json` (docs/runtime/fermeture.md, « La même
// lecture, pour l'app »). En tête, quatre chiffres — les merges depuis le dernier nettoyage, le
// rapport des lignes ajoutées aux lignes retirées, les doublons, les exports morts —, puis la liste de
// ce qui a été repéré, repliée derrière un bouton : chaque trouvaille avec son fichier et ses lignes.
// Sans closer réglé, la partie le dit, et donne le geste qui en règle un : un bouton, qui écrit dans le
// second les deux réglages choisis ensemble, le modèle et l'effort — aucun chiffre.
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
 *   | { configured: true, closer: { model: string, effort: string }, observation: Observation, findings: Trouvaille[], request: { state: string } }} Fermeture
 * @typedef {{ fermeture: Fermeture } | { erreur: string }} Lu
 * @typedef {{ modele: string, effort: string }} Choix
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
export const REGLER = "Set the closer…";
export const CHOISIR_MODELE = "model…";
export const CHOISIR_EFFORT = "effort…";
export const AUCUNE = "nothing found";

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

// Une liste fermée, son invite en tête : rien n'est choisi tant que le chef ne l'a pas fait.
/** @param {Fabrique} doc @param {string} invite @param {readonly string[]} valeurs @param {string} choisie */
function liste(doc, invite, valeurs, choisie) {
  const choix = cree(doc, "select");
  choix.ariaLabel = invite;
  for (const [texte, valeur] of [[invite, ""], ...valeurs.map((valeur) => [valeur, valeur])]) {
    const option = cree(doc, "option", texte);
    option.value = valeur;
    choix.append(option);
  }
  choix.value = valeurs.includes(choisie) ? choisie : "";
  return choix;
}

// Le message, puis le geste : le modèle et l'effort se choisissent ensemble — l'un sans l'autre fait
// refuser le démarrage (docs/runtime/fermeture.md) —, et le bouton, recommandé, n'agit qu'une fois les
// deux choisis. Il écrit les deux réglages dans le second, et rien ne part : ce qui s'écrit, et les
// valeurs que la station accepte, sont au survol. `choix` : ce que le chef a déjà choisi, qu'une
// relecture ne lui retire pas ; `choisir` le garde à chaque changement.
/**
 * @param {Fabrique} doc @param {{ modeles: readonly string[], efforts: readonly string[] }} valeurs
 * @param {(modele: string, effort: string) => void} regler
 * @param {Choix} choix @param {(choix: Choix) => void} choisir
 */
function sansCloser(doc, valeurs, regler, choix, choisir) {
  const bloc = cree(doc, "div");
  bloc.className = "closer-sans";
  const dit = cree(doc, "p", SANS_CLOSER);
  dit.className = "attendu";
  const modele = liste(doc, CHOISIR_MODELE, valeurs.modeles, choix.modele);
  const effort = liste(doc, CHOISIR_EFFORT, valeurs.efforts, choix.effort);
  const bouton = cree(doc, "button", REGLER);
  bouton.type = "button";
  bouton.className = "recommande";
  const pret = () => void (bouton.disabled = modele.value === "" || effort.value === "");
  pret();
  for (const changee of [modele, effort]) {
    changee.addEventListener("change", () => {
      pret();
      choisir({ modele: modele.value, effort: effort.value });
    });
  }
  bouton.addEventListener("click", () => {
    if (modele.value !== "" && effort.value !== "") regler(modele.value, effort.value);
  });
  const geste = cree(doc, "span");
  geste.className = "action";
  geste.append(
    bouton,
    survol(doc, `writes the closer's model and effort into the second, without sending them: you press Enter there — they take effect without a restart. Model: ${valeurs.modeles.join(", ")} · effort: ${valeurs.efforts.join(", ")}`),
  );
  const reglage = cree(doc, "div");
  reglage.className = "reglage-closer";
  reglage.append(modele, effort, geste);
  bloc.append(dit, reglage);
  return bloc;
}

// --- La partie ---------------------------------------------------------------------

/**
 * @typedef {object} Options
 * @property {boolean} [ouvert]  la liste des trouvailles est dépliée
 * @property {() => void} [basculer]  la déplie ou la replie
 * @property {{ modeles: readonly string[], efforts: readonly string[] }} [valeurs]  le calibrage que la station accepte
 * @property {(modele: string, effort: string) => void} [regler]  écrit le réglage du closer dans le second
 * @property {Choix} [choix]  le modèle et l'effort que le chef a déjà choisis, sans closer réglé
 * @property {(choix: Choix) => void} [choisir]  garde ce choix
 * @property {any[]} [lancement]  ce qui se pose à la place du lancement et de l'état de la demande
 * @property {any[]} [bilan]  ce qui se pose à la place du bilan
 */

// La partie entière. `lu` indéfini : la première lecture est en route.
/** @param {Fabrique} doc @param {Lu | undefined} lu @param {Options} options */
export function poserCloser(doc, lu, { ouvert = false, basculer = () => {}, valeurs = { modeles: [], efforts: [] }, regler = () => {}, choix = { modele: "", effort: "" }, choisir = () => {}, lancement = [], bilan = [] } = {}) {
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
    tete.append(sansCloser(doc, valeurs, regler, choix, choisir));
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
