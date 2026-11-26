// @ts-check
// La carte d'attente de l'app (ticket 2918, maquette `Components.dc.html` et `Project.dc.html` de docs/maquettes/app/) : le
// bon d'un ticket qui attend le chef, rouge dans la colonne de son étape (ticket 3458), sur le fond chaud de ce qui l'attend, et la carte de réponse posée dessous
// — ce qui se passe, la question, un bouton par choix, un champ pour répondre dans ses mots. Elle est bâtie sur le bon
// (composants/slip), la pastille « awaiting you » (composants/pill) et les boutons (composants/button) : elle ne dessine
// aucun des trois. Sa peau est dans `card-wait.css`, à côté, qui ne nomme aucun écran.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément, la vue lui donne le sien et les tests un faux.

import { slip } from "../slip/slip.js";
import { pill } from "../pill/pill.js";

/** @typedef {import("../pill/pill.js").State} State */
/** @typedef {{ createElement(balise: string): any }} Fabrique */

// La carte d'attente : un bon (`bon`) marqué `data-carte="attente"`, dont la peau est celle de ce qui attend le chef.
// `attendu` : le ticket attend le chef, la pastille « awaiting you » le dit en mots à côté de celle de son état.
/** @param {Fabrique} doc @param {{ numero: any, mot?: string, etat?: State, hors?: boolean, attendu?: boolean }} options @returns {HTMLLIElement} */
export function cardWait(doc, { numero, mot: word, etat: state, hors: outside = false, attendu = false }) {
  const cree = slip(doc, { numero, hors: outside, ...(word === undefined ? {} : { mot: word }), ...(state === undefined ? {} : { etat: state }) });
  cree.dataset.carte = "attente";
  if (attendu) cree.children[0]?.append(pill(doc, "awaiting", "awaiting you"));
  return cree;
}

// La carte de réponse posée sous un bon d'attente : `sorte` (product, …), `source` ("github" pour une carte lue de GitHub),
// `resolue` pour la réponse gardée d'une carte partie de TODO.
/** @param {Fabrique} doc @param {{ sorte?: string, source?: string, resolue?: boolean }} [options] */
export function cardDeAnswer(doc, { sorte, source, resolue = false } = {}) {
  const cree = doc.createElement("section");
  cree.className = "carte-todo";
  if (sorte !== undefined) cree.dataset.sorte = sorte;
  if (source !== undefined) cree.dataset.source = source;
  if (resolue) cree.dataset.resolue = "";
  return cree;
}
