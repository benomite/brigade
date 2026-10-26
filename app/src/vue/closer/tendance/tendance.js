// @ts-check
// La tendance du rapport ajouté / retiré de chaque projet (ticket 1682, épique 1663) : une page de l'app, ouverte
// depuis l'accueil comme celle des coûts, qui lit `closing --json` sur la box de chaque projet et pose, pour
// chacun qui a un closer réglé, son rapport actuel et s'il baisse, tient ou monte. Un projet sans closer réglé
// n'y est pas.
//
// Le runtime n'écrit pas d'historique : `closing --json` donne le rapport sur les 20, 50 et 100 derniers merges
// (`observation.ratio`, runtime/src/closing/ratio.ts), chaque fenêtre prise sur la même liste de merges, les
// plus récents d'abord. Leurs différences sont donc trois tranches qui se suivent — les merges 51 à 100 en
// arrière, 21 à 50, les 20 derniers — et leurs rapports, les valeurs successives d'où se lit la tendance : la
// plus récente face à la plus ancienne, à 10 % près. Une tranche de moins de 10 merges ne compte pas ; il en
// faut deux, sinon l'écran dit « not enough data » et n'invente rien.
//
// Le rapport actuel est celui de la partie closer d'un projet (section.js) : sur la plus longue fenêtre, dans
// les mots de `closing` (`reads`). Ce module ne touche pas `document` : il reçoit de quoi créer un élément
// (briques.js), et rend des éléments.

import { lectureIndisponible, survol } from "../../briques.js";
import { BRANCHE_ILLISIBLE, ILLISIBLE, lireFermeture, NON_COMMUNIQUE } from "../section.js";

/** @typedef {import("../../briques.js").Fabrique} Fabrique */
/** @typedef {import("../../../box.ts").Lecture} Lecture */
/** @typedef {import("../section.js").Fenetre} Fenetre */
/** @typedef {{ nom: string, teinte?: string }} ProjetDeLaTendance */
// Une tranche de merges, de `de` à `a` en arrière (1, le plus récent), et ce qu'elle a ajouté et retiré.
/** @typedef {{ de: number, a: number, merges: number, added: number, removed: number }} Tranche */
// `valeur` : le rapport de la tranche — `Infinity` quand elle n'a rien retiré.
/** @typedef {Tranche & { valeur: number }} Valeur */
/**
 * @typedef {{ sens: "down" | "flat" | "up", valeurs: Valeur[] }
 *   | { sens: "not enough data", valeurs: Valeur[], merges: number }} Tendance
 */

export const TITRE = "added / removed, per project";
export const ACCUEIL = "added / removed ratio and its trend";
export const LECTURE = "reading…";
export const PEU = "not enough data";
export const SENS = /** @type {const} */ ({ down: "going down", flat: "flat", up: "going up" });
export const AUCUN = "No project has a closer set.";
// Le moins de merges qu'une tranche compte, et l'écart en deçà duquel deux rapports se valent.
export const MERGES_PAR_TRANCHE = 10;
export const MARGE = 0.1;

const nombre = (/** @type {number} */ valeur) => valeur.toLocaleString("en-US");
const s = (/** @type {number} */ combien) => (combien > 1 ? "s" : "");

/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

// --- Le calcul ---------------------------------------------------------------------

// Les tranches que les fenêtres découpent, la plus ancienne d'abord. Une fenêtre qui n'a pas trouvé plus de
// merges que la précédente (une branche jeune) n'en ouvre pas.
/** @param {Fenetre[]} fenetres @returns {Tranche[]} */
export function tranches(fenetres) {
  /** @type {Tranche[]} */
  const coupees = [];
  let avant = { merges: 0, added: 0, removed: 0 };
  for (const fenetre of [...fenetres].sort((une, autre) => une.window - autre.window)) {
    const merges = fenetre.merges - avant.merges;
    if (merges > 0) coupees.push({ de: avant.merges + 1, a: fenetre.merges, merges, added: fenetre.added - avant.added, removed: fenetre.removed - avant.removed });
    avant = fenetre;
  }
  return coupees.reverse();
}

// La tendance : les tranches d'au moins MERGES_PAR_TRANCHE merges qui ont changé une ligne, la plus récente face
// à la plus ancienne. Plus bas de plus de MARGE, le rapport baisse ; plus haut, il monte ; sinon, il tient.
/** @param {Fenetre[]} fenetres @returns {Tendance} */
export function tendance(fenetres) {
  const valeurs = tranches(fenetres)
    .filter(({ merges, added, removed }) => merges >= MERGES_PAR_TRANCHE && added + removed > 0)
    .map((tranche) => ({ ...tranche, valeur: tranche.removed === 0 ? Infinity : tranche.added / tranche.removed }));
  const premiere = valeurs[0];
  const derniere = valeurs.at(-1);
  if (premiere === undefined || derniere === undefined || valeurs.length < 2) return { sens: "not enough data", valeurs, merges: Math.max(0, ...fenetres.map(({ merges }) => merges)) };
  if (derniere.valeur < premiere.valeur * (1 - MARGE)) return { sens: "down", valeurs };
  if (derniere.valeur > premiere.valeur * (1 + MARGE)) return { sens: "up", valeurs };
  return { sens: "flat", valeurs };
}

// --- Les mots ----------------------------------------------------------------------

// Un rapport, comme `closing` l'écrit (runtime/src/closing/ratio.ts) : `9.1:1`, ou `nothing removed`.
/** @param {number} valeur */
export const rapportDit = (valeur) => (valeur === Infinity ? "nothing removed" : `${valeur.toLocaleString("en-US", { maximumFractionDigits: 1 })}:1`);
// Une tranche : `last 20 merges`, `21–50 merges ago`.
/** @param {Tranche} tranche */
export const trancheDite = ({ de, a }) => (de === 1 ? `last ${a} merge${s(a)}` : `${de}–${a} merges ago`);
// Les valeurs successives, la plus ancienne d'abord.
/** @param {Valeur[]} valeurs */
export const valeursDites = (valeurs) => valeurs.map((valeur) => `${trancheDite(valeur)}: ${rapportDit(valeur.valeur)}`).join(" · ");

const COMMENT = `the ratio of the most recent span of merges against the oldest one: more than ${MARGE * 100}% lower is going down, more than ${MARGE * 100}% higher going up, flat otherwise`;
/** @param {number} merges */
const pourquoiPeu = (merges) =>
  `a trend needs the ratio of at least two spans of ${MERGES_PAR_TRANCHE} merges or more that changed a line, out of the last 100 — this branch has ${merges} merge${s(merges)} that count`;

// --- La page -----------------------------------------------------------------------

// Le rapport actuel : la plus longue fenêtre, dans les mots de `closing`, ce qu'elle compte au-dessous.
/** @param {Fabrique} doc @param {Fenetre[]} fenetres */
function actuel(doc, fenetres) {
  const fenetre = [...fenetres].sort((une, autre) => une.window - autre.window).at(-1);
  const bloc = cree(doc, "span");
  bloc.className = "actuel";
  if (fenetre === undefined || fenetre.merges === 0) {
    const sans = cree(doc, "span", fenetre === undefined ? NON_COMMUNIQUE : "no merge yet");
    sans.className = "rapport sans";
    bloc.append(sans);
    return bloc;
  }
  const rapport = cree(doc, "span", fenetre.reads);
  rapport.className = "rapport";
  const precise = cree(doc, "span", `+${nombre(fenetre.added)} / −${nombre(fenetre.removed)} · last ${fenetre.merges} merge${s(fenetre.merges)}`);
  precise.className = "precise";
  bloc.append(rapport, precise);
  return bloc;
}

// La tendance d'un projet : son sens et ses valeurs successives, ou « not enough data » et pourquoi, au survol.
/** @param {Fabrique} doc @param {Tendance} lue */
function sens(doc, lue) {
  const bloc = cree(doc, "span");
  bloc.className = "tendance";
  if (lue.sens === "not enough data") {
    const peu = cree(doc, "span", PEU);
    peu.className = "sens peu";
    bloc.append(peu, survol(doc, pourquoiPeu(lue.merges)));
    return bloc;
  }
  const dit = cree(doc, "span", SENS[lue.sens]);
  dit.className = "sens";
  dit.dataset.sens = lue.sens;
  const valeurs = cree(doc, "span", valeursDites(lue.valeurs));
  valeurs.className = "valeurs";
  bloc.append(dit, survol(doc, COMMENT), valeurs);
  return bloc;
}

// La ligne d'un projet : sa teinte et son nom — un clic l'ouvre —, puis ce que sa lecture en dit. `undefined` :
// un projet sans closer réglé, qui n'a pas de ligne.
/** @param {Fabrique} doc @param {ProjetDeLaTendance} projet @param {Lecture} lecture @param {(nom: string) => void} ouvrir */
function ligne(doc, projet, lecture, ouvrir) {
  const lu = lireFermeture(lecture);
  if ("fermeture" in lu && !lu.fermeture.configured) return undefined;
  const item = cree(doc, "li");
  const teinte = cree(doc, "span");
  teinte.className = "teinte";
  if (projet.teinte !== undefined) teinte.style.setProperty("--teinte", projet.teinte);
  const nom = cree(doc, "button", projet.nom);
  nom.type = "button";
  nom.className = "projet";
  nom.title = `open ${projet.nom}`;
  nom.addEventListener("click", () => ouvrir(projet.nom));
  item.append(teinte, nom);
  if ("erreur" in lu) {
    item.append(lectureIndisponible(doc, ILLISIBLE, lu.erreur));
    return item;
  }
  const { observation } = /** @type {Extract<import("../section.js").Fermeture, { configured: true }>} */ (lu.fermeture);
  if (!observation.readable) {
    item.append(lectureIndisponible(doc, BRANCHE_ILLISIBLE, observation.error));
    return item;
  }
  item.append(actuel(doc, observation.ratio), sens(doc, tendance(observation.ratio)));
  return item;
}

/**
 * La page : son titre, puis une ligne par projet lu qui a un closer réglé, dans l'ordre du fichier. Tant qu'un
 * projet n'est pas lu, une ligne le dit ; tous lus, et aucun closer réglé, la page le dit.
 * @param {Fabrique} doc @param {ProjetDeLaTendance[]} projets @param {Map<string, Lecture>} lectures @param {(nom: string) => void} ouvrir
 */
export function poserTendances(doc, projets, lectures, ouvrir) {
  const bloc = cree(doc, "div");
  bloc.className = "tendances";
  bloc.append(cree(doc, "h2", TITRE));
  const nonLus = projets.filter(({ nom }) => !lectures.has(nom)).length;
  const lignes = projets.flatMap((projet) => {
    const lecture = lectures.get(projet.nom);
    return (lecture === undefined ? undefined : ligne(doc, projet, lecture, ouvrir)) ?? [];
  });
  if (lignes.length > 0) {
    const liste = cree(doc, "ol");
    liste.className = "projets-tendance";
    liste.append(...lignes);
    bloc.append(liste);
  }
  if (nonLus > 0) {
    const lecture = cree(doc, "p", nonLus === projets.length ? LECTURE : `${LECTURE} ${nonLus} more project${s(nonLus)}`);
    lecture.className = "sans";
    bloc.append(lecture);
  } else if (lignes.length === 0) {
    const aucun = cree(doc, "p", AUCUN);
    aucun.className = "sans";
    aucun.append(survol(doc, "a closer is set on a project's page, in the closer section of its Cooks tab"));
    bloc.append(aucun);
  }
  return bloc;
}
