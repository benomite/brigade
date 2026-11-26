// @ts-check
// La ligne de l'attente de la file, en tête du rail d'un projet (ticket 3433) : pourquoi les tickets en file ne partent pas,
// en une phrase — celle du runtime (runtime/src/attente-du-rail/raison.ts), que la vue ne réécrit pas. Une panne
// (raisons 1 à 3, qui ne passent pas seules) est marquée FAULT, en rouge, avec le geste en bouton — qui ouvre l'onglet
// Stations, où il se fait, ou démarre la station de cet ordinateur (rail-bloque/ligne-du-rail-bloque.js) ; une attente qui passe seule se dit en note, sans alarme.
// Ce module ne touche pas `document` : il reçoit une fabrique et ce que le bouton appelle, et rend des éléments.

import { boutonDuGeste } from "../rail-bloque/ligne-du-rail-bloque.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("../../../../runtime/src/attente-du-rail/raison.ts").AttenteDuRail} AttenteDuRailLue */

export const MARQUE = "FAULT";

/** @param {Fabrique} doc @param {AttenteDuRailLue | undefined} attente @param {import("../rail-bloque/ligne-du-rail-bloque.js").GestesDuRail | null} gestes @returns {HTMLElement[]} */
export function ligneDeLAttente(doc, attente, gestes) {
  if (attente === undefined) return [];
  const ligne = doc.createElement("p");
  const panne = attente.geste !== null;
  ligne.className = panne ? "panne-du-rail attente-du-rail" : "attente-du-rail";
  ligne.dataset.raison = attente.raison;
  if (panne) {
    ligne.role = "alert";
    const marque = doc.createElement("span");
    marque.className = "marque";
    marque.textContent = MARQUE;
    ligne.append(marque);
  }
  const phrase = doc.createElement("strong");
  const boutons = boutonDuGeste(doc, attente.geste, gestes);
  // Avec le bouton qui démarre la station d'ici, la phrase ne renvoie plus à « its computer » : le bouton le dit.
  phrase.textContent = boutons.length > 0 && attente.geste === "demarrer-la-station" ? attente.phrase.replace(/ Start it on its computer\.$/, "") : attente.phrase;
  ligne.append(phrase);
  ligne.append(...boutons);
  return [ligne];
}
