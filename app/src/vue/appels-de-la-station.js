// @ts-check
// Les appels de la box à GitHub sur la page de sa station (ticket 1418, épique 1415) : combien sur la dernière heure,
// puis le projet et la lecture qui en ont fait le plus, tels que `faits` les donne (`appelsGithub`). Un runtime
// d'avant ce champ, ou une station dont aucun projet lu ne le dit, n'a pas de chiffre : la ligne reste, neutre,
// avec un tiret. Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js).

import { survol } from "./briques.js";

/** @typedef {import("./briques.js").Fabrique} Fabrique */
/** @typedef {import("../faits.ts").AppelsGithub} AppelsGithub */

const TITRE = "GitHub calls, last hour";

// La ligne à poser sous l'en-tête de la station. `appels` absent : le tiret neutre, jamais une erreur.
/**
 * @param {Fabrique} doc
 * @param {AppelsGithub | undefined} appels
 */
export function poserLesAppels(doc, appels) {
  const pose = doc.createElement("p");
  pose.className = "appels-de-la-station";
  if (appels === undefined) {
    pose.dataset.appels = "absents";
    pose.textContent = `${TITRE}: —`;
    pose.append(survol(doc, "this station does not report them yet"));
    return pose;
  }
  pose.dataset.appels = "lus";
  pose.textContent = `${TITRE}: ${appels.total}`;
  const { topProject, topKind } = appels;
  if (topProject !== null && topKind !== null) {
    pose.append(` — most from ${topProject.name} (${topProject.calls}), mostly ${topKind.name} (${topKind.calls})`);
    pose.append(survol(doc, `the project and the kind of reading that made the most calls on the box over the last hour: ${topProject.name} ${topProject.calls}, ${topKind.name} ${topKind.calls} of ${appels.total}`));
  }
  return pose;
}
