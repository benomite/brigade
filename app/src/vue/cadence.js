// @ts-check
// Sur une carte de Taken ou de Pass (ticket 1811) : son âge — qui tranche par sa couleur quand elle y est depuis bien plus
// longtemps que d'ordinaire —, et ses essais. Tout est calculé par cadence.ts : la vue pose. L'histogramme des 24 heures
// a quitté la tête du rail avec la bande de chiffres (ticket 3013).
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js), et rend un élément.

import { survol } from "./briques.js";

/** @typedef {import("./briques.js").Fabrique} Fabrique */
/** @typedef {import("../cadence.ts").Anciennete} Anciennete */
/** @typedef {import("../cadence.ts").Point} Point */

// Chaque classe est posée en clair, `className = "…"` : la peau ne vise que des classes que la vue
// pose, et son test les lit ainsi (peau.test.ts).
/** @param {Fabrique} doc @param {string} balise */
const cree = (doc, balise) => doc.createElement(balise);

// L'âge d'une carte de Taken ou de Pass, court ; l'exact au survol. Bien plus long que d'ordinaire, il tranche.
/** @param {Fabrique} doc @param {Anciennete} age */
export function poserAge(doc, age) {
  const pose = cree(doc, "span");
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
export function poserEssais(doc, points) {
  const pose = cree(doc, "span");
  pose.className = "essais";
  pose.role = "group";
  pose.ariaLabel = `${points.length} attempts`;
  for (const point of points) {
    const rond = cree(doc, "span");
    rond.className = "essai";
    if (point.enCours) rond.dataset.enCours = "";
    rond.title = point.dit;
    rond.ariaLabel = point.dit;
    pose.append(rond);
  }
  return pose;
}
