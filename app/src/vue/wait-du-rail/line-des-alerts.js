// @ts-check
// La ligne d'alerte en tête du rail d'un projet (ticket 3823) : la première des alertes que le runtime a jugées vraies et
// actionnables (wait-du-rail/alerts.ts) — la vue n'en écrit aucune, n'en juge aucune. Une panne, comme le
// rail bloqué : marquée FAULT, en rouge. Sa phrase dit le fait, depuis quand et quel ticket ou quel check ; ce que la cuisine
// fait déjà pour la lever se dit à voix basse à côté ; le geste qui la lève, quand l'app sait le faire, est son bouton
// (rail-blocked/line-du-rail-blocked.js) — sans bouton, la phrase le dit en toutes lettres. Le fait se relit au survol.
// Ce module ne touche pas `document` : il reçoit une fabrique et ce que le bouton appelle, et rend des éléments.

import { buttonDuAction, MARQUE } from "../rail-blocked/line-du-rail-blocked.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("../../wait-du-rail/alerts.ts").AlertDuRail} AlertDuRail */

/** @param {AlertDuRail["fait"]} fait @returns {string} */
const faitDit = ({ depuis, ticket, check }) => [`since ${depuis.slice(0, 16).replace("T", " ")} UTC`, ticket === undefined ? null : `#${ticket}`, check === undefined ? null : `check: ${check}`].filter((un) => un !== null).join(" · ");

/** @param {Fabrique} doc @param {readonly AlertDuRail[] | undefined} alerts @param {import("../rail-blocked/line-du-rail-blocked.js").ActionsDuRail | null} actions @returns {HTMLElement[]} */
export function lineDesAlertsDuRail(doc, alerts, actions) {
  const [alert] = alerts ?? [];
  if (alert === undefined) return [];
  const line = doc.createElement("p");
  line.className = "panne-du-rail alerte-du-rail";
  line.role = "alert";
  line.dataset.sorte = alert.sorte;
  line.title = faitDit(alert.fait);
  const marque = doc.createElement("span");
  marque.className = "marque";
  marque.textContent = MARQUE;
  const phrase = doc.createElement("strong");
  const boutons = buttonDuAction(doc, alert.bouton ?? null, actions);
  // Avec son bouton, le geste n'est plus redit en fin de phrase : le bouton le dit.
  phrase.textContent = boutons.length > 0 && alert.geste !== null && alert.phrase.endsWith(` ${alert.geste}.`) ? alert.phrase.slice(0, -(alert.geste.length + 2)) : alert.phrase;
  line.append(marque, phrase);
  if (alert.geree !== null) {
    const geree = doc.createElement("span");
    geree.className = "geree";
    geree.textContent = alert.geree;
    line.append(geree);
  }
  line.append(...boutons);
  return [line];
}
