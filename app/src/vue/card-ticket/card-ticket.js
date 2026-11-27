// @ts-check
// Sur la carte d'un ticket du rail : le garde-fou qui l'a tué deux fois (ticket 3650). La ligne le dit en tête, sous
// la tête de la carte, et chaque arrêt — l'heure, l'activité où le cook en était, son run — est dans la liste qui suit,
// toujours lisible. Elle reste tant que la box le dit : le ticket n'est pas relancé en silence. Tout est calculé par
// guard-repeated.ts : la vue pose. Ce module ne touche pas `document` : il reçoit de quoi créer un élément.

/** @typedef {import("../bricks.js").Fabrique} Fabrique */
/** @typedef {import("./guard-repeated.ts").LineOfGuard} LineOfGuard */

/** @param {Fabrique} doc @param {LineOfGuard} garde */
export function setGuardRepeated(doc, { ligne: line, details }) {
  const pose = doc.createElement("div");
  pose.className = "garde-repetee";
  const sentence = doc.createElement("p");
  sentence.className = "ligne-carte garde-repetee-ligne";
  sentence.textContent = line;
  const stops = doc.createElement("ul");
  stops.className = "garde-repetee-arrets";
  for (const { dit: said, survol: hover } of details) {
    const stop = doc.createElement("li");
    stop.textContent = said;
    stop.title = hover;
    stops.append(stop);
  }
  pose.append(sentence, stops);
  return pose;
}
