// @ts-check
// La carte d'attente de l'app (ticket 2918, maquette `Components.dc.html` et `Project.dc.html` de docs/maquettes/app/) : le
// bon d'un ticket qui attend le chef, rouge dans la colonne de son étape (ticket 3458), sur le fond chaud de ce qui l'attend, et la carte de réponse posée dessous
// — ce qui se passe, la question, un bouton par choix, un champ pour répondre dans ses mots. Elle est bâtie sur le bon
// (components/slip), la pastille « awaiting you » (components/pill) et les boutons (components/button) : elle ne dessine
// aucun des trois. Sa peau est dans `card-wait.css`, à côté, qui ne nomme aucun écran.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément, la vue lui donne le sien et les tests un faux.

import { slip } from "../slip/slip.js";
import { pill } from "../pill/pill.js";

/** @typedef {import("../pill/pill.js").State} State */
/** @typedef {{ createElement(balise: string): any }} Fabrique */

// La carte d'attente : un bon (`bon`) marqué `data-carte="attente"`, dont la peau est celle de ce qui attend le chef.
// `attendu` : le ticket attend le chef, la pastille « awaiting you » le dit en mots à côté de celle de son état.
/** @param {Fabrique} doc @param {{ numero: any, mot?: string, etat?: State, hors?: boolean, attendu?: boolean }} options @returns {HTMLLIElement} */
export function cardWait(doc, { numero: number, mot: word, etat: state, hors: outside = false, attendu: expected = false }) {
  const created = slip(doc, { numero: number, hors: outside, ...(word === undefined ? {} : { mot: word }), ...(state === undefined ? {} : { etat: state }) });
  created.dataset.carte = "attente";
  if (expected) created.children[0]?.append(pill(doc, "awaiting", "awaiting you"));
  return created;
}

// La carte de réponse posée sous un bon d'attente : `sorte` (product, …), `source` ("github" pour une carte lue de GitHub),
// `resolue` pour la réponse gardée d'une carte partie de TODO.
/** @param {Fabrique} doc @param {{ sorte?: string, source?: string, resolue?: boolean }} [options] */
export function cardOfAnswer(doc, { sorte: kind, source, resolue: resolved = false } = {}) {
  const created = doc.createElement("section");
  created.className = "carte-todo";
  if (kind !== undefined) created.dataset.sorte = kind;
  if (source !== undefined) created.dataset.source = source;
  if (resolved) created.dataset.resolue = "";
  return created;
}
