// @ts-check
// En tête du rail, à côté de la barre de ce qui est avant lui (tickets 1811, 1836) : à quelle allure la cuisine sert.
// Un petit histogramme des 24 dernières heures, haut d'une ligne, une barre fine par heure, l'heure en cours à droite —
// les servis en vert en bas, les ratés en rouge dessus. Une heure sans rien est une case vide sur un trait de base : une
// suite de cases vides se voit d'un coup d'œil, sans phrase. Le seul texte : au survol d'une barre, ou au toucher sur le
// téléphone, son heure et ses deux comptes. Et, sur une carte de Taken ou de Pass, son âge — qui tranche par sa couleur
// quand elle y est depuis bien plus longtemps que d'ordinaire. Tout est calculé par cadence.ts : la vue pose.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js), et rend un élément.

import { survol } from "./briques.js";

/** @typedef {import("./briques.js").Fabrique} Fabrique */
/** @typedef {import("../cadence.ts").Histogramme} Histogramme */
/** @typedef {import("../cadence.ts").Anciennete} Anciennete */
/** @typedef {import("../cadence.ts").Point} Point */

// Chaque classe est posée en clair, `className = "…"` : la peau ne vise que des classes que la vue
// pose, et son test les lit ainsi (peau.test.ts).
/** @param {Fabrique} doc @param {string} balise */
const cree = (doc, balise) => doc.createElement(balise);

// L'histogramme, ou rien d'un runtime qui ne le donne pas.
/** @param {Fabrique} doc @param {Histogramme | undefined} histogramme */
export function poserCadence(doc, histogramme) {
  if (histogramme === undefined) return null;
  const graphe = cree(doc, "div");
  graphe.className = "cadence";
  graphe.role = "group";
  graphe.ariaLabel = histogramme.nom;
  for (const barre of histogramme.barres) {
    // Une barre est un bouton : le survol, le clavier et le toucher y ouvrent la même bulle.
    const cible = cree(doc, "button");
    cible.type = "button";
    cible.className = "barre";
    if (barre.vide) cible.dataset.vide = "";
    if (barre.enCours) cible.dataset.enCours = "";
    const rates = cree(doc, "span");
    rates.className = "rates";
    rates.style.setProperty("height", `${barre.hautRates}%`);
    const servis = cree(doc, "span");
    servis.className = "servis";
    servis.style.setProperty("height", `${barre.hautServis}%`);
    // Empilée de haut en bas : les ratés au-dessus des servis.
    cible.append(rates, servis);
    // Au toucher, le bouton prend le focus : la bulle s'ouvre comme au survol.
    cible.addEventListener("click", () => cible.focus?.());
    graphe.append(survol(doc, barre.dit, cible));
  }
  return graphe;
}

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
