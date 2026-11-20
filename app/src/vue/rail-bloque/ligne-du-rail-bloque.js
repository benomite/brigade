// @ts-check
// Le bouton du geste qui débloque la file du rail (ticket 3358, puis 3433) : celui de l'attente de la file, en tête du rail
// (attente-du-rail/ligne-de-l-attente.js). « Add the project to a station » ouvre l'onglet Stations où il se fait ; « Start
// this computer's station » démarre la station de cet ordinateur, comme le fait l'icône de fond (ticket 3637). Une station
// d'un autre ordinateur ne se démarre pas d'ici : sans `demarrerIci`, aucun bouton ne le promet, la phrase dit où le faire
// (« Start it on its computer »). Ni dans un projet en lecture seule, où aucun geste n'est offert.
// Ce module ne touche pas `document` : il reçoit une fabrique et ce que le bouton appelle, et rend des éléments.

import { boutonAction } from "../briques.js";
import { CET_ORDINATEUR } from "../lexique.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */

// Les mots du bouton qui ouvre l'onglet Stations, ceux du runtime (`MOTS_DU_GESTE`) : la vue ne charge pas le runtime.
/** @type {Record<string, string>} */
export const GESTES = { "ajouter-a-une-station": "Add the project to a station" };
// Le bouton qui démarre la station de cet ordinateur : le runtime dit « Start it on its computer » dans sa phrase, la vue
// sait, elle, que la station est ici.
export const DEMARRER_ICI = `Start ${CET_ORDINATEUR}'s station`;

/** @typedef {{ ouvrirStations(): void, demarrerIci?(): void, demarrageRefuse?: string }} GestesDuRail */

// Le bouton d'un geste du runtime, ou rien : « demarrer-la-station » n'en a un que pour la station de cet ordinateur. Un
// démarrage que la station a refusé dit sa raison à côté du bouton.
/** @param {Fabrique} doc @param {string | null} geste @param {GestesDuRail | null} gestes @returns {HTMLElement[]} */
export function boutonDuGeste(doc, geste, gestes) {
  if (geste === null || gestes === null) return [];
  if (geste === "demarrer-la-station") {
    if (gestes.demarrerIci === undefined) return [];
    const refus = gestes.demarrageRefuse === undefined ? [] : [Object.assign(doc.createElement("span"), { className: "refus", textContent: `The station did not start: ${gestes.demarrageRefuse}` })];
    return [boutonAction(doc, DEMARRER_ICI, () => gestes.demarrerIci?.(), { recommande: true }), ...refus];
  }
  const libelle = GESTES[geste];
  return libelle === undefined ? [] : [boutonAction(doc, libelle, () => gestes.ouvrirStations(), { recommande: true })];
}
