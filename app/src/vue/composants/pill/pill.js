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
export const FORMES = { vert: "disque", jaune: "losange", rouge: "carre", bleu: "triangle", gris: "anneau", orange: "pause" };
/** @param {string | undefined} ton */
export const formeDe = (ton) => (ton === undefined ? undefined : FORMES[ton]);

// Le ton de chaque état, et l'état de chaque ton : la table des colonnes du rail (facts.ts).
/** @type {Record<State, string>} */
const TONS = { queued: "gris", taken: "bleu", pass: "jaune", awaiting: "rouge", waiting: "orange", served: "vert" };
/** @param {string | undefined} ton @returns {State | undefined} */
export const stateDuTon = (ton) => STATES.find((state) => TONS[state] === ton);

// Le marqueur seul : un point à la forme et à la couleur d'un ton ; sans ton, un point vide. `coin` : au coin d'une case.
/** @param {Fabrique} doc @param {string | undefined} ton @param {{ coin?: boolean }} [options] */
export function marque(doc, ton, { coin = false } = {}) {
  const cree = doc.createElement("span");
  cree.className = "pastille";
  if (ton !== undefined) cree.dataset.ton = ton;
  const forme = formeDe(ton);
  if (forme !== undefined) cree.dataset.forme = forme;
  if (coin) cree.dataset.pose = "coin";
  return cree;
}

// La pastille d'un état : son marqueur, puis son mot. Sans état, le mot garde sa pilule et un marqueur vide.
/** @param {Fabrique} doc @param {State | undefined} state @param {string} word */
export function pill(doc, state, word) {
  const cree = doc.createElement("span");
  if (state !== undefined) cree.dataset.pastille = state;
  else cree.className = "pilule";
  const texte = doc.createElement("span");
  texte.textContent = word;
  cree.append(marque(doc, state === undefined ? undefined : TONS[state]), texte);
  return cree;
}
