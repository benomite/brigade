// @ts-check
// La première ligne de l'onglet Stations (ticket 3189, épique 3182) : qui cuit le projet, ou que personne ne le cuit. Le
// vert n'est dit que par une station qui sert le projet : la cuisine locale (« kitchen », son journal vide) n'est pas l'état
// du projet et ne s'y lit plus. Le bouton ouvre le formulaire de choix existant (vue.js, `ouvrirConfiance`) : l'onglet n'a
// pas de choix à lui.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js).
import { boutonAction } from "../briques.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("../../cuisson.ts").LigneDeStation} Ligne */

export const CHOISIR = "Choose a station";
export const PERSONNE = "Nobody cooks this project:";
/** @param {readonly string[]} noms */
export const CUIT_PAR = (noms) => `Cooked by ${noms.join(", ")}, online`;

// Les mots d'une station qui prend les tickets du projet : elle cuit, attend le prochain, ou n'a plus de place mais tient les siens.
const SERT = new Set(["cooking", "idle", "saturated"]);

// Une station sert le projet quand elle dit l'un de ces mots et n'est pas dite hors d'atteinte par GitHub. Au repos, il faut un
// signe de vie lu : une distante dont rien ne dit qu'elle est là n'est pas dite en ligne (la cuisine locale se lit d'elle-même).
/** @param {Pick<Ligne, "etat" | "presente" | "distante">} ligne */
export const sert = ({ etat, presente, distante }) => SERT.has(etat) && (etat === "idle" ? presente === true || (presente === undefined && !distante) : presente !== false);

// Le seul endroit où le vert se refuse : une station qui ne sert pas le projet ne porte pas de vert, atteinte ou non.
/** @template {string | undefined} T @param {Pick<Ligne, "etat" | "presente" | "distante"> | undefined} ligne @param {T} ton @returns {T | "gris"} */
export const tonDe = (ligne, ton) => (ton === "vert" && (ligne === undefined || !sert(ligne)) ? "gris" : ton);

/**
 * @param {Fabrique} doc
 * @param {{ lignes: readonly Pick<Ligne, "station" | "etat" | "presente" | "distante">[], pastille: (mot: string, ton: string | undefined) => any, ouvrir: () => void }} options
 */
export function poserLaPremiereLigne(doc, { lignes, pastille, ouvrir }) {
  const noms = lignes.filter(sert).map(({ station }) => station);
  const ligne = doc.createElement("p");
  ligne.className = "premiere-ligne";
  ligne.dataset.sert = String(noms.length > 0);
  const dit = doc.createElement("strong");
  if (noms.length > 0) {
    dit.textContent = CUIT_PAR(noms);
    ligne.append(pastille("online", "vert"), dit);
  } else {
    dit.textContent = PERSONNE;
    ligne.append(dit, boutonAction(doc, CHOISIR, ouvrir, { recommande: true }));
  }
  return ligne;
}
