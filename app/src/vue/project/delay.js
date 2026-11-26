// @ts-check
// Le temps que met un projet à servir son premier ticket, sur sa page (ticket 1401, épique 1393) : de son ajout à
// la station au premier ticket servi, tel que sa principale le publie (`delai` du suivi, runtime/src/installation/
// delai/). Tant qu'aucun ticket n'est servi, le temps court — compté ici depuis l'ajout, à chaque pose ; une fois
// servi, la durée est celle que la station a figée, et ne bouge plus. Pas de délai publié, pas de ligne. Ce module
// ne touche pas `document` : il reçoit de quoi créer un élément (briques.js).

import { survol } from "../briques.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("../../projects/request.ts").Delay} Delay */

// Une durée en clair : « 2 h 34 min », « 12 min », « 3 d 4 h », « under a minute ».
/** @param {number} ms */
export function dureeEnClair(ms) {
  const minutes = Math.floor(Math.max(0, ms) / 60_000);
  if (minutes < 1) return "under a minute";
  const [jours, heures, restantes] = [Math.floor(minutes / 1440), Math.floor((minutes % 1440) / 60), minutes % 60];
  if (jours > 0) return heures === 0 ? `${jours} d` : `${jours} d ${heures} h`;
  if (heures > 0) return restantes === 0 ? `${heures} h` : `${heures} h ${restantes} min`;
  return `${minutes} min`;
}

/** @param {string} instant */
const dayEtHeure = (instant) => instant.replace("T", " ").slice(0, 16) + " UTC";

// La ligne à poser sur la page du projet, ou null. `maintenant` : l'instant de la pose, en millisecondes.
/**
 * @param {Fabrique} doc
 * @param {{ delai: Delay | null | undefined, maintenant: number }} lu
 */
export function poserDelay(doc, { delai: delay, maintenant }) {
  if (delay === null || delay === undefined) return null;
  const served = delay.duree !== null;
  const pose = doc.createElement("p");
  pose.className = "delai";
  pose.dataset.delai = served ? "fige" : "court";
  const duree = served ? delay.duree : maintenant - Date.parse(delay.ajouteLe);
  pose.textContent = served
    ? `First ticket served ${dureeEnClair(duree ?? 0)} after the project was added`
    : `Added ${dureeEnClair(duree ?? 0)} ago, no ticket served yet`;
  pose.append(survol(doc, served ? `added ${dayEtHeure(delay.ajouteLe)}, first ticket served ${dayEtHeure(delay.serviLe ?? "")}` : `added ${dayEtHeure(delay.ajouteLe)}: the time runs until the first ticket is served`));
  return pose;
}
