// @ts-check
// La ligne d'alerte en tête du rail d'un projet (ticket 3823) : la première des alertes que le runtime a jugées vraies et
// actionnables (wait-of-rail/alerts.ts) — la vue n'en écrit aucune, n'en juge aucune. Une panne, comme le
// rail bloqué : marquée FAULT, en rouge. Sa phrase dit le fait, depuis quand et quel ticket ou quel check ; ce que la cuisine
// fait déjà pour la lever se dit à voix basse à côté ; le geste qui la lève, quand l'app sait le faire, est son bouton
// (rail-blocked/line-of-rail-blocked.js) — sans bouton, la phrase le dit en toutes lettres. Le fait se relit au survol.
// Ce module ne touche pas `document` : il reçoit une fabrique et ce que le bouton appelle, et rend des éléments.

import { buttonOfAction, BRAND } from "../rail-blocked/line-of-rail-blocked.js";

/** @typedef {import("../bricks.js").Fabrique} Fabrique */
/** @typedef {import("../../wait-of-rail/alerts.ts").AlertOfRail} AlertOfRail */

/** @param {AlertOfRail["fait"]} fait @returns {string} */
const doneSays = ({ depuis: since, ticket, check }) => [`since ${since.slice(0, 16).replace("T", " ")} UTC`, ticket === undefined ? null : `#${ticket}`, check === undefined ? null : `check: ${check}`].filter((oneOf) => oneOf !== null).join(" · ");

/** @param {Fabrique} doc @param {readonly AlertOfRail[] | undefined} alerts @param {import("../rail-blocked/line-of-rail-blocked.js").ActionsOfRail | null} actions @returns {HTMLElement[]} */
export function lineOfAlertsOfRail(doc, alerts, actions) {
  const [alert] = alerts ?? [];
  if (alert === undefined) return [];
  const line = doc.createElement("p");
  line.className = "panne-du-rail alerte-du-rail";
  line.role = "alert";
  line.dataset.sorte = alert.sorte;
  line.title = doneSays(alert.fait);
  const brand = doc.createElement("span");
  brand.className = "marque";
  brand.textContent = BRAND;
  const sentence = doc.createElement("strong");
  const buttons = buttonOfAction(doc, alert.bouton ?? null, actions);
  // Avec son bouton, le geste n'est plus redit en fin de phrase : le bouton le dit.
  sentence.textContent = buttons.length > 0 && alert.geste !== null && alert.phrase.endsWith(` ${alert.geste}.`) ? alert.phrase.slice(0, -(alert.geste.length + 2)) : alert.phrase;
  line.append(brand, sentence);
  if (alert.geree !== null) {
    const handled = doc.createElement("span");
    handled.className = "geree";
    handled.textContent = alert.geree;
    line.append(handled);
  }
  line.append(...buttons);
  return [line];
}
