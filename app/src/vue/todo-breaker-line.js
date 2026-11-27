// @ts-check
// La ligne du disjoncteur, en tête de TODO (ticket 2140, épique 2134) : la cuisine retenue par son disjoncteur — ce qui ne va
// pas, en une ligne, ce que la station en écrit au survol. Une ligne d'information, sans bouton : le chef ne referme plus
// le disjoncteur (ticket 3911), la station le referme d'elle-même.
//
// Sur un autre onglet que Rail, la ligne du disjoncteur reste dans la bande d'alertes, la même.
//
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js) et rend des éléments.

import { survol } from "./briques.js";

/** @typedef {import("./briques.js").Fabrique} Fabrique */

export const TITRE = "the breaker holds the kitchen";
// L'état du projet que la ligne dit, partout de la même façon (ticket 3602) : « held: breaker open », puis ce que la station en écrit.
export const RETENUE = "held: breaker open";
/** @param {string} dit */
const retenue = (dit) => dit.replace(/breaker open:?/, `${RETENUE} —`);

/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

// La ligne, en tête de TODO : `marque`, la pastille que la vue pose ; `dit`, ce qui ne va pas ; `releve`, ce que la
// station en écrit, mot pour mot — au survol, jamais à plat ; `pourquoi`, ce même relevé écrit sous la ligne : un téléphone n'a
// pas de survol (ticket 3371).
/**
 * @param {Fabrique} doc
 * @param {{ marque: any, dit: string, releve?: string, pourquoi?: string }} ligne
 */
export function poserLigneDuDisjoncteur(doc, { marque, dit, releve, pourquoi }) {
  const racine = cree(doc, "div");
  racine.className = "ligne-disjoncteur";
  racine.ariaLabel = TITRE;
  const tete = cree(doc, "p");
  tete.className = "dit";
  tete.append(marque, cree(doc, "strong", retenue(dit)), ...(releve === undefined || releve.trim() === "" ? [] : [survol(doc, releve)]));
  racine.append(tete);
  if (pourquoi !== undefined && pourquoi.trim() !== "") {
    const raison = cree(doc, "p", pourquoi);
    raison.className = "pourquoi";
    racine.append(raison);
  }
  return racine;
}
