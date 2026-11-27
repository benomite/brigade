// @ts-check
// Les appels de la box à GitHub sur la page de sa station (ticket 1418, épique 1415) : combien sur la dernière heure,
// puis le projet et la lecture qui en ont fait le plus, tels que `faits` les donne (`appelsGithub`). Un runtime
// d'avant ce champ, ou une station dont aucun projet lu ne le dit, n'a pas de chiffre : la ligne reste, neutre,
// avec un tiret. Ce module ne touche pas `document` : il reçoit de quoi créer un élément (bricks.js).

import { hover } from "./bricks.js";

/** @typedef {import("./bricks.js").Fabrique} Fabrique */
/** @typedef {import("../facts.ts").CallsGithub} CallsGithub */

const TITLE = "GitHub calls, last hour";

// La ligne à poser sous l'en-tête de la station. `appels` absent : le tiret neutre, jamais une erreur.
/**
 * @param {Fabrique} doc
 * @param {CallsGithub | undefined} calls
 */
export function setTheCalls(doc, calls) {
  const pose = doc.createElement("p");
  pose.className = "appels-de-la-station";
  if (calls === undefined) {
    pose.dataset.appels = "absents";
    pose.textContent = `${TITLE}: —`;
    pose.append(hover(doc, "this station does not report them yet"));
    return pose;
  }
  pose.dataset.appels = "lus";
  pose.textContent = `${TITLE}: ${calls.total}`;
  const { topProject, topKind } = calls;
  if (topProject !== null && topKind !== null) {
    pose.append(` — most from ${topProject.name} (${topProject.calls}), mostly ${topKind.name} (${topKind.calls})`);
    pose.append(hover(doc, `the project and the kind of reading that made the most calls on the box over the last hour: ${topProject.name} ${topProject.calls}, ${topKind.name} ${topKind.calls} of ${calls.total}`));
  }
  return pose;
}
