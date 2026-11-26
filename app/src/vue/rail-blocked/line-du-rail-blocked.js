// @ts-check
// La ligne du rail bloqué, en tête du rail d'un projet (ticket 3358) : des tickets `fire` qu'aucun manager n'a pris au-delà
// du délai. Une panne, comme la cuisine oisive : marquée FAULT, en rouge, au-dessus des colonnes. Elle dit en une phrase
// combien de tickets, depuis combien de temps, et la cause (rail-blocked.ts) ; le geste qui débloque, quand il y en a un,
// est son bouton (recommandé) — « Add the project to a station », qui ouvre l'onglet Stations où il se fait ; « Start this
// computer's station », qui démarre la station de cet ordinateur, comme le fait l'icône de fond (ticket 3637). Une station
// d'un autre ordinateur ne se démarre pas d'ici : sans `demarrerIci`, aucun bouton ne le promet, la phrase dit où le faire
// (« Start it on its computer »).
// Sans geste, pas de bouton ; ni dans un projet en lecture seule, où aucun geste n'est offert. Les tickets bloqués se lisent
// au survol.
// Ce module ne touche pas `document` : il reçoit une fabrique et ce que le bouton appelle, et rend des éléments.

import { buttonAction } from "../briques.js";
import { CET_ORDINATEUR } from "../lexique.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("./rail-blocked.ts").RailBlockedLu} RailBlockedLu */

export const MARQUE = "FAULT";
// Les mots du bouton qui ouvre l'onglet Stations, ceux du runtime (`MOTS_DU_GESTE`) : la vue ne charge pas le runtime.
/** @type {Record<string, string>} */
export const ACTIONS = { "ajouter-a-une-station": "Add the project to a station" };
// Le bouton qui démarre la station de cet ordinateur : le runtime dit « Start it on its computer » dans sa phrase, la vue
// sait, elle, que la station est ici.
export const DEMARRER_ICI = `Start ${CET_ORDINATEUR}'s station`;

/** @typedef {{ ouvrirStations(): void, demarrerIci?(): void, demarrageRefuse?: string }} ActionsDuRail */

// Le bouton d'un geste du runtime, ou rien : « demarrer-la-station » n'en a un que pour la station de cet ordinateur. Un
// démarrage que la station a refusé dit sa raison à côté du bouton.
/** @param {Fabrique} doc @param {string | null} action @param {ActionsDuRail | null} actions @returns {HTMLElement[]} */
export function buttonDuAction(doc, action, actions) {
  if (action === null || actions === null) return [];
  if (action === "demarrer-la-station") {
    if (actions.demarrerIci === undefined) return [];
    const refusal = actions.demarrageRefuse === undefined ? [] : [Object.assign(doc.createElement("span"), { className: "refus", textContent: `The station did not start: ${actions.demarrageRefuse}` })];
    return [buttonAction(doc, DEMARRER_ICI, () => actions.demarrerIci?.(), { recommande: true }), ...refusal];
  }
  const libelle = ACTIONS[action];
  return libelle === undefined ? [] : [buttonAction(doc, libelle, () => actions.ouvrirStations(), { recommande: true })];
}

// La ligne, ou rien : sans rail bloqué, ou quand les tickets non pris ne se lisent pas — la file du second le dit.
/** @param {Fabrique} doc @param {RailBlockedLu | undefined} railBlocked @param {ActionsDuRail | null} actions @returns {HTMLElement[]} */
export function lineDuRailBlocked(doc, railBlocked, actions) {
  if (railBlocked === undefined || "illisible" in railBlocked) return [];
  const line = doc.createElement("p");
  line.className = "panne-du-rail rail-bloque";
  line.role = "alert";
  line.title = `${railBlocked.tickets.map((ticket) => `#${ticket}`).join(", ")} — no manager has taken ${railBlocked.tickets.length === 1 ? "it" : "them"}.`;
  const marque = doc.createElement("span");
  marque.className = "marque";
  marque.textContent = MARQUE;
  const constat = doc.createElement("strong");
  const boutons = buttonDuAction(doc, railBlocked.geste, actions);
  // Sans bouton, la phrase dit le geste en toutes lettres (« Start it on its computer ») ; avec lui, le bouton le dit.
  constat.textContent = railBlocked.geste !== null && boutons.length === 0 ? railBlocked.phrase : railBlocked.constat;
  line.append(marque, constat, ...boutons);
  return [line];
}
