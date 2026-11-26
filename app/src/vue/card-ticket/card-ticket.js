// @ts-check
// Sur la carte d'un ticket du rail : le garde-fou qui l'a tué deux fois (ticket 3650). La ligne le dit en tête, sous
// la tête de la carte, et chaque arrêt — l'heure, l'activité où le cook en était, son run — est dans la liste qui suit,
// toujours lisible. Elle reste tant que la box le dit : le ticket n'est pas relancé en silence. Tout est calculé par
// guard-repetee.ts : la vue pose. Ce module ne touche pas `document` : il reçoit de quoi créer un élément.

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("./guard-repetee.ts").LineDeGuard} LineDeGuard */

/** @param {Fabrique} doc @param {LineDeGuard} garde */
export function poserGuardRepetee(doc, { ligne: line, details }) {
  const pose = doc.createElement("div");
  pose.className = "garde-repetee";
  const phrase = doc.createElement("p");
  phrase.className = "ligne-carte garde-repetee-ligne";
  phrase.textContent = line;
  const arrets = doc.createElement("ul");
  arrets.className = "garde-repetee-arrets";
  for (const { dit, survol } of details) {
    const stop = doc.createElement("li");
    stop.textContent = dit;
    stop.title = survol;
    arrets.append(stop);
  }
  pose.append(phrase, arrets);
  return pose;
}
