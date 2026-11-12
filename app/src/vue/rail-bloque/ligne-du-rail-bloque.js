// @ts-check
// La ligne du rail bloqué, en tête du rail d'un projet (ticket 3358) : des tickets `fire` qu'aucun manager n'a pris au-delà
// du délai. Une panne, comme la cuisine oisive : marquée FAULT, en rouge, au-dessus des colonnes. Elle dit en une phrase
// combien de tickets, depuis combien de temps, et la cause (rail-bloque.ts) ; le geste qui débloque, quand il y en a un,
// est son bouton (recommandé) — « Start the station » ou « Add the project to a station » —, qui ouvre l'onglet Stations où il se fait.
// Sans geste, pas de bouton ; ni dans un projet en lecture seule, où aucun geste n'est offert. Les tickets bloqués se lisent
// au survol.
// Ce module ne touche pas `document` : il reçoit une fabrique et ce que le bouton appelle, et rend des éléments.

import { boutonAction } from "../briques.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("./rail-bloque.ts").RailBloqueLu} RailBloqueLu */

export const MARQUE = "FAULT";
// Les mots des gestes (runtime/src/rail-bloque/rail-bloque.ts, `MOTS_DU_GESTE`) : la vue ne charge pas le runtime.
/** @type {Record<string, string>} */
export const GESTES = { "demarrer-la-station": "Start the station", "ajouter-a-une-station": "Add the project to a station" };

// La ligne, ou rien : sans rail bloqué, ou quand les tickets non pris ne se lisent pas — la file du second le dit.
/** @param {Fabrique} doc @param {RailBloqueLu | undefined} railBloque @param {{ ouvrirStations(): void } | null} gestes @returns {HTMLElement[]} */
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
  constat.textContent = railBloque.constat;
  ligne.append(marque, constat);
  const geste = railBloque.geste === null ? undefined : GESTES[railBloque.geste];
  if (geste !== undefined && gestes !== null) ligne.append(boutonAction(doc, geste, () => gestes.ouvrirStations(), { recommande: true }));
  return [ligne];
}
