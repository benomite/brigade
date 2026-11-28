// @ts-check
// Sur une carte de Taken ou de Pass (ticket 1811) : son âge — qui tranche par sa couleur quand elle y est depuis bien plus
// longtemps que d'ordinaire —, et ses essais. Tout est calculé par cadence.ts : la vue pose. L'histogramme des 24 heures
// a quitté la tête du rail avec la bande de chiffres (ticket 3013).
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (bricks.js), et rend un élément.


/** @typedef {import("./bricks.js").Fabrique} Fabrique */
/** @typedef {import("../cadence.ts").Seniority} Seniority */
/** @typedef {import("../cadence.ts").Point} Point */

// Chaque classe est posée en clair, `className = "…"` : la peau ne vise que des classes que la vue
// pose, et son test les lit ainsi (skin.test.ts).
/** @param {Fabrique} doc @param {string} balise */
const created = (doc, balise) => doc.createElement(balise);

// L'âge d'une carte de Taken ou de Pass, court ; l'exact au survol. Bien plus long que d'ordinaire, il tranche.
/** @param {Fabrique} doc @param {Seniority} age */
export function setAge(doc, age) {
  const pose = created(doc, "span");
  pose.className = "age";
  pose.textContent = age.court;
  pose.title = age.dit;
  pose.ariaLabel = age.dit;
  if (age.longue) pose.dataset.longue = "";
  return pose;
}

// Les essais d'une carte, à côté de son âge : un point par essai, le courant plein et les finis creux ; chaque point
// fini dit au survol pourquoi son essai s'est arrêté.
/** @param {Fabrique} doc @param {Point[]} points */
export function setTrials(doc, points) {
  const pose = created(doc, "span");
  pose.className = "essais";
  pose.role = "group";
  pose.ariaLabel = `${points.length} attempts`;
  for (const point of points) {
    const round = created(doc, "span");
    round.className = "essai";
    if (point.enCours) round.dataset.enCours = "";
    round.title = point.dit;
    round.ariaLabel = point.dit;
    pose.append(round);
  }
  return pose;
}
