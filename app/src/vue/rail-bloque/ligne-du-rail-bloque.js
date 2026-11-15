// @ts-check
// La ligne du rail bloqué, en tête du rail d'un projet (ticket 3358) : des tickets `fire` qu'aucun manager n'a pris au-delà
// du délai. Une panne, comme la cuisine oisive : marquée FAULT, en rouge, au-dessus des colonnes. Elle dit en une phrase
// combien de tickets, depuis combien de temps, et la cause (rail-bloque.ts) ; le geste qui débloque, quand il y en a un,
// est son bouton (recommandé) — « Add the project to a station », qui ouvre l'onglet Stations où il se fait ; « Start this
// computer's station », qui démarre la station de cet ordinateur, comme le fait l'icône de fond (ticket 3637). Une station
// d'un autre ordinateur ne se démarre pas d'ici : sans `demarrerIci`, aucun bouton ne le promet, la phrase dit où le faire
// (« Start it on its computer »).
// Sans geste, pas de bouton ; ni dans un projet en lecture seule, où aucun geste n'est offert. Les tickets bloqués se lisent
// au survol.
// Ce module ne touche pas `document` : il reçoit une fabrique et ce que le bouton appelle, et rend des éléments.

import { boutonAction } from "../briques.js";
import { CET_ORDINATEUR } from "../lexique.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("./rail-bloque.ts").RailBloqueLu} RailBloqueLu */

export const MARQUE = "FAULT";
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

// La ligne, ou rien : sans rail bloqué, ou quand les tickets non pris ne se lisent pas — la file du second le dit.
/** @param {Fabrique} doc @param {RailBloqueLu | undefined} railBloque @param {GestesDuRail | null} gestes @returns {HTMLElement[]} */
export function ligneDuRailBloque(doc, railBloque, gestes) {
  if (railBloque === undefined || "illisible" in railBloque) return [];
  const ligne = doc.createElement("p");
  ligne.className = "panne-du-rail rail-bloque";
  ligne.role = "alert";
  ligne.title = `${railBloque.tickets.map((ticket) => `#${ticket}`).join(", ")} — no manager has taken ${railBloque.tickets.length === 1 ? "it" : "them"}.`;
  const marque = doc.createElement("span");
  marque.className = "marque";
  marque.textContent = MARQUE;
  const constat = doc.createElement("strong");
  const boutons = boutonDuGeste(doc, railBloque.geste, gestes);
  // Sans bouton, la phrase dit le geste en toutes lettres (« Start it on its computer ») ; avec lui, le bouton le dit.
  constat.textContent = railBloque.geste !== null && boutons.length === 0 ? railBloque.phrase : railBloque.constat;
  ligne.append(marque, constat, ...boutons);
  return [ligne];
}
