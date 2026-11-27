// @ts-check
// La poêle de l'app (ticket 2984) : une petite poêle 8-bit qui grésille à côté de ce qu'un agent fait en ce moment — un
// cook sur son ticket, la pass qui juge une livraison, le manager qui qualifie ou découpe une issue. Dessinée pour
// Brigade, pixel par pixel, sur une grille de 11 × 7, chaque pixel doublé à l'écran : le fer, ce qui cuit dedans, la
// vapeur. Trois trames, que sa peau (`pan.css`, à côté) fait se suivre ; quand le système demande moins de mouvement,
// la première reste, immobile.
// La poêle ne lit rien : l'écran qui la pose décide seul que le travail tourne, et ne la pose pas sur ce qui attend, ni
// sur une lecture dont il ne sait plus si elle dit vrai.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément, la vue lui donne le sien et les tests un faux.

const SVG = "http://www.w3.org/2000/svg";

/** @typedef {{ createElement(balise: string): any, createElementNS(space: string, balise: string): any }} Fabrique */
/** @typedef {readonly [number, number, number, number]} Pixels x, y, largeur, hauteur, sur la grille */

// Le fer : le bord, le corps, le fond, et le manche qui remonte.
/** @type {readonly Pixels[]} */
const FER = [
  [0, 4, 1, 1],
  [7, 4, 1, 1],
  [0, 5, 8, 1],
  [8, 5, 1, 1],
  [9, 4, 2, 1],
  [1, 6, 6, 1],
];

// Les trois trames : ce qui cuit se soulève, un morceau saute, la vapeur monte d'un côté puis de l'autre.
/** @type {readonly { mets: readonly Pixels[], vapeur: readonly Pixels[] }[]} */
export const FRAMES = [
  {
    mets: [[1, 4, 6, 1], [2, 3, 2, 1], [5, 3, 1, 1]],
    vapeur: [[3, 0, 1, 1], [2, 1, 1, 1], [5, 1, 1, 1]],
  },
  {
    mets: [[1, 4, 6, 1], [3, 3, 2, 1], [6, 2, 1, 1]],
    vapeur: [[2, 0, 1, 1], [4, 1, 1, 1]],
  },
  {
    mets: [[1, 4, 6, 1], [2, 3, 1, 1], [5, 3, 1, 1], [3, 1, 1, 1]],
    vapeur: [[5, 0, 1, 1], [6, 1, 1, 1]],
  },
];

// Ce qu'elle dit au survol et à un lecteur d'écran.
export const SAYS_OF_THE_PAN = "cooking: an agent is working on it right now";

/** @param {Fabrique} doc @param {string} classe @param {readonly Pixels[]} pixels */
function paint(doc, classe, pixels) {
  const group = doc.createElementNS(SVG, "g");
  group.setAttribute("class", classe);
  for (const [x, y, width, height] of pixels) {
    const pixel = doc.createElementNS(SVG, "rect");
    for (const [name, value] of Object.entries({ x, y, width: width, height: height })) pixel.setAttribute(name, String(value));
    group.append(pixel);
  }
  return group;
}

// La poêle : un `span` qui tient son dessin, à poser à côté de ce qui cuit.
/** @param {Fabrique} doc */
export function pan(doc) {
  const created = doc.createElement("span");
  created.className = "poele";
  created.role = "img";
  created.title = SAYS_OF_THE_PAN;
  created.ariaLabel = SAYS_OF_THE_PAN;
  const drawing = doc.createElementNS(SVG, "svg");
  for (const [name, value] of Object.entries({ viewBox: "0 0 11 7", width: "22", height: "14", "shape-rendering": "crispEdges", "aria-hidden": "true" })) drawing.setAttribute(name, value);
  const fer = paint(doc, "fer", FER);
  const frames = FRAMES.map(({ mets, vapeur }, rank) => {
    const frame = doc.createElementNS(SVG, "g");
    frame.setAttribute("class", `trame trame-${rank + 1}`);
    frame.append(paint(doc, "mets", mets), paint(doc, "vapeur", vapeur));
    return frame;
  });
  drawing.append(fer, ...frames);
  created.append(drawing);
  return created;
}
