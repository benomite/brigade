// @ts-check
// « undo » sur la carte d'un ticket servi (ticket 3274, épique 3267) : dans Served, sous « open the merged PR », un bouton
// annule le ticket d'un clic — le prix est au survol. Le geste part par le pont : le process principal joue la commande
// `undo` du runtime (undo-github.ts). Pendant qu'il part, le bouton le dit et ne se clique plus ; fait, la carte dit en une
// ligne ce qui s'est passé — le revert en pass et le ticket rouvert, ou, quand du travail servi depuis s'appuie dessus, le
// ticket déposé pour que la cuisine l'annule à la main — et le bouton s'en va ; refusé, le bouton revient et la carte dit
// pourquoi, le détail au survol. Seule une carte de ticket servi, dont la PR est mergée, porte le bouton.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément et le geste, et rend des éléments.

import { buttonAction } from "../bricks.js";
import { lineError } from "../components/line-error/line-error.js";

/** @typedef {import("../bricks.js").Fabrique} Fabrique */

// Le geste en route depuis cette vue, pour une carte.
//   repos   rien n'est parti d'ici
//   envoi   le geste part : le bouton attend
//   refus   rien n'a été fait (`dit`, et `detail` au survol) : le bouton revient
//   fait    la commande l'a joué : sa ligne reste sur la carte
/**
 * @typedef {{ etape: "repos" }
 *   | { etape: "envoi" }
 *   | { etape: "refus", dit: string, detail: string }
 *   | { etape: "fait", dit: string }} State
 */

/** @type {State} */
export const REPOS = { etape: "repos" };

// Les mots du glossaire (docs/glossary.md) : ticket, pass, served, kitchen.
export const CANCEL = "undo";
export const EN_CANCELLATION = "undoing…";
/** @param {number} ticket */
export const PRICE = (ticket) =>
  `undo #${ticket}: a pull request reverts its merge from your GitHub account, and the pass judges and merges it like any delivery — its review may be launched on the project's quota; #${ticket} is reopened`;
export const WITHOUT_BRIDGE = "nothing was undone: this app does not play the kitchen's command — undo it from the desktop app";

// L'étape qui suit ce que le process principal a rendu.
/** @param {import("./undo-github.ts").RenderedOfCancellation | undefined} rendered @returns {State} */
export function afterRendered(rendered) {
  if (rendered === undefined) return { etape: "refus", dit: "nothing was undone: this project is not known to the app", detail: "" };
  if ("refus" in rendered) return { etape: "refus", dit: rendered.refus, detail: rendered.detail };
  return { etape: "fait", dit: rendered.fait };
}

// Le bouton « undo » de la carte du ticket servi `ticket`, dans son état — ou, fait, la ligne de ce qui s'est passé.
/** @param {Fabrique} doc @param {number} ticket @param {State} state @param {() => void} cancel @returns {any[]} */
export function setCancellation(doc, ticket, state, cancel) {
  if (state.etape === "fait") {
    const line = doc.createElement("p");
    line.className = "annule";
    line.textContent = state.dit;
    return [line];
  }
  const action = buttonAction(doc, state.etape === "envoi" ? EN_CANCELLATION : CANCEL, cancel, { prix: PRICE(ticket) });
  const button = action.children?.[0];
  if (button !== undefined) {
    button.className = `${button.className} annuler-servi`.trim();
    button.disabled = state.etape === "envoi";
  }
  return [action, ...(state.etape === "refus" ? [lineError(doc, state.dit, state.detail, { classe: "refus" })] : [])];
}
