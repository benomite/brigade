// @ts-check
// Le bon de l'app (ticket 2918, maquette `Components.dc.html` de docs/maquettes/app/) : un ticket sur son papier, le même
// partout où un écran en montre un — le rail, Cooks, la fiche. Il pose le bon et sa tête : le numéro du ticket, puis son
// état dit par la pastille (components/pill). Ce qui s'y ajoute — étiquettes, titre, phrases, gestes — reste à l'écran
// qui le pose, avec les boutons de components/button ; sa peau est dans `slip.css`, à côté, qui ne nomme aucun écran.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément, la vue lui donne le sien et les tests un faux.

import { pill } from "../pill/pill.js";

/** @typedef {import("../pill/pill.js").State} State */
/** @typedef {{ createElement(balise: string): any }} Fabrique */

// Le bon : un `li` sur le papier, avec sa tête — le numéro, puis la pastille de son état si le
// ticket en a un (`etat` : celui de la colonne, ou aucun ; `mot` : le mot de la file). `hors` : un ticket d'aucune des six
// colonnes, posé en ligne sous la grille. La tête est le premier enfant du bon.
/** @param {Fabrique} doc @param {{ numero: any, mot?: string, etat?: State, hors?: boolean }} options @returns {HTMLLIElement} */
export function slip(doc, { numero: number, mot: word, etat: state, hors: outside = false }) {
  const created = doc.createElement("li");
  created.className = "bon";
  if (outside) created.dataset.hors = "";
  const head = doc.createElement("div");
  head.append(number);
  if (word !== undefined) head.append(pill(doc, state, word));
  created.append(head);
  return created;
}

// La tête d'un bon posé : ce à quoi un écran ajoute son âge, ses essais, la pastille « awaiting you ».
/** @param {any} created */
export const headOfSlip = (created) => created.children[0];
