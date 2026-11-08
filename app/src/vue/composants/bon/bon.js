// @ts-check
// Le bon de l'app (ticket 2918, maquette `Components.dc.html` de docs/maquettes/app/) : un ticket sur son papier, le même
// partout où un écran en montre un — le rail, Cooks, la fiche. Il pose le bon et sa tête : le numéro du ticket, puis son
// état dit par la pastille (composants/pastille). Ce qui s'y ajoute — étiquettes, titre, phrases, gestes — reste à l'écran
// qui le pose, avec les boutons de composants/bouton ; sa peau est dans `bon.css`, à côté, qui ne nomme aucun écran.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément, la vue lui donne le sien et les tests un faux.

import { pastille } from "../pastille/pastille.js";

/** @typedef {import("../pastille/pastille.js").Etat} Etat */
/** @typedef {{ createElement(balise: string): any }} Fabrique */

// Le bon : un `li` sur le papier, avec sa tête — le numéro, puis la pastille de son état si le
// ticket en a un (`etat` : celui de la colonne, ou aucun ; `mot` : le mot de la file). `hors` : un ticket d'aucune des six
// colonnes, posé en ligne sous la grille. La tête est le premier enfant du bon.
/** @param {Fabrique} doc @param {{ numero: any, mot?: string, etat?: Etat, hors?: boolean }} options @returns {HTMLLIElement} */
export function bon(doc, { numero, mot, etat, hors = false }) {
  const cree = doc.createElement("li");
  cree.className = "bon";
  if (hors) cree.dataset.hors = "";
  const tete = doc.createElement("div");
  tete.append(numero);
  if (mot !== undefined) tete.append(pastille(doc, etat, mot));
  cree.append(tete);
  return cree;
}

// La tête d'un bon posé : ce à quoi un écran ajoute son âge, ses essais, la pastille « awaiting you ».
/** @param {any} cree */
export const teteDuBon = (cree) => cree.children[0];
