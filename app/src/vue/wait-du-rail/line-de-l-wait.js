// @ts-check
// La ligne de l'attente de la file, en tête du rail d'un projet (ticket 3433) : pourquoi les tickets en file ne partent pas,
// en une phrase — celle du runtime (runtime/src/attente-du-rail/raison.ts), que la vue ne réécrit pas. Une panne
// (raisons 1 à 3, qui ne passent pas seules) est marquée FAULT, en rouge, avec le geste en bouton — qui ouvre l'onglet
// Stations, où il se fait, ou démarre la station de cet ordinateur (rail-blocked/line-du-rail-blocked.js) ; une attente qui passe seule se dit en note, sans alarme.
// Ce module ne touche pas `document` : il reçoit une fabrique et ce que le bouton appelle, et rend des éléments.

import { buttonDuAction } from "../rail-blocked/line-du-rail-blocked.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("../../../../runtime/src/attente-du-rail/raison.ts").AttenteDuRail} WaitDuRailLue */

export const MARQUE = "FAULT";

/** @param {Fabrique} doc @param {WaitDuRailLue | undefined} wait @param {import("../rail-blocked/line-du-rail-blocked.js").ActionsDuRail | null} actions @returns {HTMLElement[]} */
export function lineDeLWait(doc, wait, actions) {
  if (wait === undefined) return [];
  const line = doc.createElement("p");
  const outage = wait.geste !== null;
  line.className = outage ? "panne-du-rail attente-du-rail" : "attente-du-rail";
  line.dataset.raison = wait.raison;
  if (outage) {
    line.role = "alert";
    const marque = doc.createElement("span");
    marque.className = "marque";
    marque.textContent = MARQUE;
    line.append(marque);
  }
  const phrase = doc.createElement("strong");
  const boutons = buttonDuAction(doc, wait.geste, actions);
  // Avec le bouton qui démarre la station d'ici, la phrase ne renvoie plus à « its computer » : le bouton le dit.
  phrase.textContent = boutons.length > 0 && wait.geste === "demarrer-la-station" ? wait.phrase.replace(/ Start it on its computer\.$/, "") : wait.phrase;
  line.append(phrase);
  line.append(...boutons);
  return [line];
}
