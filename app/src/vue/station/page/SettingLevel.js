// @ts-check
// La marque du niveau d'un réglage (ticket 1310, puis 2641, épique 2497) : « this machine », « project » ou « you »,
// posée à côté du réglage — par chaque section de la page d'une station, et partout ailleurs par `niveauDe`
// (levels.js), qui la demande ici à partir de la clé du réglage. Les mots et le survol de chaque niveau ne se disent
// qu'ici, pour que le niveau se dise partout de la même façon. Ce module ne touche pas `document` : il reçoit de quoi
// créer un élément.

/** @typedef {import("../../bricks.js").Fabrique} Fabrique */
/** @typedef {"project" | "machine" | "you"} Level */

/** @type {Readonly<Record<Level, { libelle: string, survol: string }>>} */
import { THIS_COMPUTER } from "../../lexicon.js";
export const LEVELS_SAID = {
  project: { libelle: "project", survol: "kept in the project's repository — shared with everyone who clones it, and changed by a pull request" },
  machine: { libelle: THIS_COMPUTER, survol: `kept on ${THIS_COMPUTER}'s station — private, never written to the repository` },
  you: { libelle: "you", survol: "your preference in the app — it follows you, not the project" },
};

// La marque d'un niveau ; un niveau que la table ne connaît pas ne se rend pas.
/** @param {Fabrique} doc @param {Level} level */
export function levelSetting(doc, level) {
  const said = LEVELS_SAID[level];
  if (said === undefined) throw new Error(`unknown setting level "${level}"`);
  const brand = doc.createElement("span");
  brand.className = "niveau";
  brand.dataset.niveau = level;
  brand.textContent = said.libelle;
  brand.title = said.survol;
  return brand;
}
