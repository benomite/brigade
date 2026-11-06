// @ts-check
// La marque du niveau d'un réglage sur la page d'une station (ticket 2641, épique 2497) : « this machine », « project » ou
// « you », posée à côté du réglage par chaque section de la page. Les mots et le survol sont ceux de niveaux.js, pour que
// le niveau se dise partout de la même façon ; cette marque les pose à partir d'un niveau, quand niveaux.js les pose à
// partir d'une clé de réglage. Ce module ne touche pas `document` : il reçoit de quoi créer un élément.

import { NIVEAUX_DITS } from "../../niveaux.js";

/** @typedef {import("../../briques.js").Fabrique} Fabrique */
/** @typedef {import("../../niveaux.js").Niveau} Niveau */

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
