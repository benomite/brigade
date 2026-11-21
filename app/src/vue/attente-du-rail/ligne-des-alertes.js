// @ts-check
// La ligne d'alerte en tête du rail d'un projet (ticket 3823) : la première des alertes que le runtime a jugées vraies et
// actionnables (attente-du-rail/alertes.ts) — la vue n'en écrit aucune, n'en juge aucune. Une panne, comme le
// rail bloqué : marquée FAULT, en rouge. Sa phrase dit le fait, depuis quand et quel ticket ou quel check ; ce que la cuisine
// fait déjà pour la lever se dit à voix basse à côté ; le geste qui la lève, quand l'app sait le faire, est son bouton
// (rail-bloque/ligne-du-rail-bloque.js) — sans bouton, la phrase le dit en toutes lettres. Le fait se relit au survol.
// Ce module ne touche pas `document` : il reçoit une fabrique et ce que le bouton appelle, et rend des éléments.

import { boutonDuGeste, MARQUE } from "../rail-bloque/ligne-du-rail-bloque.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("../../attente-du-rail/alertes.ts").AlerteDuRail} AlerteDuRail */

/** @param {AlerteDuRail["fait"]} fait @returns {string} */
const faitDit = ({ depuis, ticket, check }) => [`since ${depuis.slice(0, 16).replace("T", " ")} UTC`, ticket === undefined ? null : `#${ticket}`, check === undefined ? null : `check: ${check}`].filter((un) => un !== null).join(" · ");

/** @param {Fabrique} doc @param {readonly AlerteDuRail[] | undefined} alertes @param {import("../rail-bloque/ligne-du-rail-bloque.js").GestesDuRail | null} gestes @returns {HTMLElement[]} */
export function ligneDesAlertesDuRail(doc, alertes, gestes) {
  const [alerte] = alertes ?? [];
  if (alerte === undefined) return [];
  const ligne = doc.createElement("p");
  ligne.className = "panne-du-rail alerte-du-rail";
  ligne.role = "alert";
  ligne.dataset.sorte = alerte.sorte;
  ligne.title = faitDit(alerte.fait);
  const marque = doc.createElement("span");
  marque.className = "marque";
  marque.textContent = MARQUE;
  const phrase = doc.createElement("strong");
  const boutons = boutonDuGeste(doc, alerte.bouton ?? null, gestes);
  // Avec son bouton, le geste n'est plus redit en fin de phrase : le bouton le dit.
  phrase.textContent = boutons.length > 0 && alerte.geste !== null && alerte.phrase.endsWith(` ${alerte.geste}.`) ? alerte.phrase.slice(0, -(alerte.geste.length + 2)) : alerte.phrase;
  ligne.append(marque, phrase);
  if (alerte.geree !== null) {
    const geree = doc.createElement("span");
    geree.className = "geree";
    geree.textContent = alerte.geree;
    ligne.append(geree);
  }
  ligne.append(...boutons);
  return [ligne];
}
