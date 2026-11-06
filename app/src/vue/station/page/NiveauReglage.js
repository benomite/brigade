// @ts-check
// La marque du niveau d'un réglage (ticket 1310, puis 2641, épique 2497) : « this machine », « project » ou « you »,
// posée à côté du réglage — par chaque section de la page d'une station, et partout ailleurs par `niveauDe`
// (niveaux.js), qui la demande ici à partir de la clé du réglage. Les mots et le survol de chaque niveau ne se disent
// qu'ici, pour que le niveau se dise partout de la même façon. Ce module ne touche pas `document` : il reçoit de quoi
// créer un élément.

/** @typedef {import("../../briques.js").Fabrique} Fabrique */
/** @typedef {"project" | "machine" | "you"} Niveau */

/** @type {Readonly<Record<Niveau, { libelle: string, survol: string }>>} */
export const NIVEAUX_DITS = {
  project: { libelle: "project", survol: "kept in the project's repository — shared with everyone who clones it, and changed by a pull request" },
  machine: { libelle: "this machine", survol: "kept on this machine's station — private, never written to the repository" },
  you: { libelle: "you", survol: "your preference in the app — it follows you, not the project" },
};

// La marque d'un niveau ; un niveau que la table ne connaît pas ne se rend pas.
/** @param {Fabrique} doc @param {Niveau} niveau */
export function niveauReglage(doc, niveau) {
  const dit = NIVEAUX_DITS[niveau];
  if (dit === undefined) throw new Error(`unknown setting level "${niveau}"`);
  const marque = doc.createElement("span");
  marque.className = "niveau";
  marque.dataset.niveau = niveau;
  marque.textContent = dit.libelle;
  marque.title = dit.survol;
  return marque;
}
