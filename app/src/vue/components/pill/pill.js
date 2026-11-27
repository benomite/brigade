// @ts-check
// La pastille de l'app (ticket 2917, maquette de docs/maquettes/app/) : l'état d'un ticket, dit de la même façon sur
// chaque écran. Six états — queued, taken, in pass, awaiting you, waiting, served —, chacun sa forme et sa couleur, fixées
// ici et dans `pill.css` : la couleur ne porte jamais seule l'information. Un écran ne choisit qu'un état et un mot ;
// il ne dessine pas la pastille.
// Le ton est celui que l'app a déjà (facts.ts : la couleur de chaque colonne et de chaque mot d'état) : c'est lui qui
// choisit l'état, rien n'est déduit d'autre. Le marqueur seul (`marque`) sert aussi aux autres états de l'app — un
// projet, une station —, qui ont leurs tons mais pas de mot d'état de ticket.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément, la vue lui donne le sien et les tests un faux.

/** @typedef {"queued" | "taken" | "pass" | "awaiting" | "waiting" | "served"} State */
/** @typedef {{ createElement(balise: string): any }} Fabrique */

/** @type {readonly State[]} */
export const STATES = ["queued", "taken", "pass", "awaiting", "waiting", "served"];

// La forme d'un ton : un disque plein, un losange, un carré, un anneau creux, un triangle, une pause — distincts en
// niveaux de gris.
/** @type {Record<string, string>} */
export const SHAPES = { vert: "disque", jaune: "losange", rouge: "carre", bleu: "triangle", gris: "anneau", orange: "pause" };
/** @param {string | undefined} your */
export const shapeOf = (your) => (your === undefined ? undefined : SHAPES[your]);

// Le ton de chaque état, et l'état de chaque ton : la table des colonnes du rail (facts.ts).
/** @type {Record<State, string>} */
const TONES = { queued: "gris", taken: "bleu", pass: "jaune", awaiting: "rouge", waiting: "orange", served: "vert" };
/** @param {string | undefined} your @returns {State | undefined} */
export const stateOfYour = (your) => STATES.find((state) => TONES[state] === your);

// Le marqueur seul : un point à la forme et à la couleur d'un ton ; sans ton, un point vide. `coin` : au coin d'une case.
/** @param {Fabrique} doc @param {string | undefined} your @param {{ coin?: boolean }} [options] */
export function brand(doc, your, { coin = false } = {}) {
  const created = doc.createElement("span");
  created.className = "pastille";
  if (your !== undefined) created.dataset.ton = your;
  const shape = shapeOf(your);
  if (shape !== undefined) created.dataset.forme = shape;
  if (coin) created.dataset.pose = "coin";
  return created;
}

// La pastille d'un état : son marqueur, puis son mot. Sans état, le mot garde sa pilule et un marqueur vide.
/** @param {Fabrique} doc @param {State | undefined} state @param {string} word */
export function pill(doc, state, word) {
  const created = doc.createElement("span");
  if (state !== undefined) created.dataset.pastille = state;
  else created.className = "pilule";
  const text = doc.createElement("span");
  text.textContent = word;
  created.append(brand(doc, state === undefined ? undefined : TONES[state]), text);
  return created;
}
