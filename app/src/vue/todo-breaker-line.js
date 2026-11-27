// @ts-check
// La ligne du disjoncteur, en tête de TODO (ticket 2140, épique 2134) : la cuisine retenue par son disjoncteur — ce qui ne va
// pas, en une ligne, ce que la station en écrit au survol. Une ligne d'information, sans bouton : le chef ne referme plus
// le disjoncteur (ticket 3911), la station le referme d'elle-même.
//
// Sur un autre onglet que Rail, la ligne du disjoncteur reste dans la bande d'alertes, la même.
//
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (bricks.js) et rend des éléments.

import { hover } from "./bricks.js";

/** @typedef {import("./bricks.js").Fabrique} Fabrique */

export const TITLE = "the breaker holds the kitchen";
// L'état du projet que la ligne dit, partout de la même façon (ticket 3602) : « held: breaker open », puis ce que la station en écrit.
export const HELD = "held: breaker open";
/** @param {string} said */
const retainedOne = (said) => said.replace(/breaker open:?/, `${HELD} —`);

/** @param {Fabrique} doc @param {string} balise @param {string} [text] */
function created(doc, balise, text) {
  const pose = doc.createElement(balise);
  if (text !== undefined) pose.textContent = text;
  return pose;
}

// La ligne, en tête de TODO : `marque`, la pastille que la vue pose ; `dit`, ce qui ne va pas ; `releve`, ce que la
// station en écrit, mot pour mot — au survol, jamais à plat ; `pourquoi`, ce même relevé écrit sous la ligne : un téléphone n'a
// pas de survol (ticket 3371).
/**
 * @param {Fabrique} doc
 * @param {{ marque: any, dit: string, releve?: string, pourquoi?: string }} ligne
 */
export function setLineOfBreaker(doc, { marque: brand, dit: said, releve: reading, pourquoi: why }) {
  const root = created(doc, "div");
  root.className = "ligne-disjoncteur";
  root.ariaLabel = TITLE;
  const head = created(doc, "p");
  head.className = "dit";
  head.append(brand, created(doc, "strong", retainedOne(said)), ...(reading === undefined || reading.trim() === "" ? [] : [hover(doc, reading)]));
  root.append(head);
  if (why !== undefined && why.trim() !== "") {
    const reason = created(doc, "p", why);
    reason.className = "pourquoi";
    root.append(reason);
  }
  return root;
}
