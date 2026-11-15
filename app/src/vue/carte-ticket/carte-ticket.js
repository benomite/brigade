// @ts-check
// Sur la carte d'un ticket du rail : le garde-fou qui l'a tué deux fois (ticket 3650). La ligne le dit en tête, sous
// la tête de la carte, et chaque arrêt — l'heure, l'activité où le cook en était, son run — est dans la liste qui suit,
// toujours lisible. Elle reste tant que la box le dit : le ticket n'est pas relancé en silence. Tout est calculé par
// garde-repetee.ts : la vue pose. Ce module ne touche pas `document` : il reçoit de quoi créer un élément.

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("./garde-repetee.ts").LigneDeGarde} LigneDeGarde */

/** @param {Fabrique} doc @param {LigneDeGarde} garde */
export function poserGardeRepetee(doc, { ligne, details }) {
  const pose = doc.createElement("div");
  pose.className = "garde-repetee";
  const phrase = doc.createElement("p");
  phrase.className = "ligne-carte garde-repetee-ligne";
  phrase.textContent = ligne;
  const arrets = doc.createElement("ul");
  arrets.className = "garde-repetee-arrets";
  for (const { dit, survol } of details) {
    const arret = doc.createElement("li");
    arret.textContent = dit;
    arret.title = survol;
    arrets.append(arret);
  }
  pose.append(phrase, arrets);
  return pose;
}
