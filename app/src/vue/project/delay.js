// @ts-check
// Le temps que met un projet à servir son premier ticket, sur sa page (ticket 1401, épique 1393) : de son ajout à
// la station au premier ticket servi, tel que sa principale le publie (`delai` du suivi).
// Tant qu'aucun ticket n'est servi, le temps court — compté ici depuis l'ajout, à chaque pose ; une fois
// servi, la durée est celle que la station a figée, et ne bouge plus. Pas de délai publié, pas de ligne. Ce module
// ne touche pas `document` : il reçoit de quoi créer un élément (bricks.js).


/** @typedef {import("../bricks.js").Fabrique} Fabrique */
/** @typedef {import("../../projects/request.ts").Delay} Delay */

// Une durée en clair : « 2 h 34 min », « 12 min », « 3 d 4 h », « under a minute ».
/** @param {number} ms */
export function durationInClear(ms) {
  const minutes = Math.floor(Math.max(0, ms) / 60_000);
  if (minutes < 1) return "under a minute";
  const [days, hours, remaining] = [Math.floor(minutes / 1440), Math.floor((minutes % 1440) / 60), minutes % 60];
  if (days > 0) return hours === 0 ? `${days} d` : `${days} d ${hours} h`;
  if (hours > 0) return remaining === 0 ? `${hours} h` : `${hours} h ${remaining} min`;
  return `${minutes} min`;
}


