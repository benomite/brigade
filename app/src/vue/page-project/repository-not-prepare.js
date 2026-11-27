// @ts-check
// L'avis d'un projet qui n'est pas préparé pour Brigade (ticket 2628, épique 2584) : sur sa page et dans son TODO, une
// phrase — ce qui manque — et un seul bouton, le geste de l'ajout d'un projet (`runRepoSetup`). Un projet préparé n'a
// rien de nouveau : aucun avis. Aucune commande de préparation n'est jamais montrée.
//
// Pendant la préparation, le bouton attend et l'avis dit qu'elle est en route ; ratée, il dit en une phrase pourquoi
// et « Retry » est rendu. Réussie, l'avis s'en va sans recharger : la vue le retire à la lecture qui suit.
//
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (bricks.js) et ce que le clic appelle, et
// rend des éléments. La vue tient l'état, projet par projet.

import { buttonAction, hover } from "./../bricks.js";
import { lineError } from "../components/line-error/line-error.js";
import { RETRY } from "../lexicon.js";

/** @typedef {import("./../bricks.js").Fabrique} Fabrique */
/** @typedef {{ ready: boolean, missingBindings: string[], missingLabels: string[] }} Preparation */

// Où l'avis est posé : la page du projet, ou son TODO.
/** @typedef {"page" | "todo"} Place */

// L'état d'un projet, vu d'ici.
//   inconnu     la préparation n'a pas encore été lue : rien n'est dit
//   prepare     rien ne manque : rien n'est dit
//   manque      il manque quelque chose (`verif`) : le bouton attend le chef
//   en-route    la préparation est en route : le bouton attend
//   refus       elle a raté (`dit`, une phrase) : le bouton est rendu pour réessayer
/**
 * @typedef {{ etape: "inconnu" }
 *   | { etape: "prepare" }
 *   | { etape: "manque", verif: Preparation }
 *   | { etape: "en-route", verif: Preparation }
 *   | { etape: "refus", verif: Preparation, dit: string }} State
 */

/** @type {State} */
export const UNKNOWN = { etape: "inconnu" };

export const PREPARE = "Set up for Brigade";
export { RETRY };
export const IN_ROUTE = "setting the project up…";
export const TITLE = "this project is not set up for Brigade";

/** @param {number} n @param {string} word */
const account = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// L'état qui suit la lecture de la préparation.
/** @param {Preparation} check @returns {State} */
export function afterTheRead(check) {
  return check.ready ? { etape: "prepare" } : { etape: "manque", verif: check };
}

// La phrase de ce qui manque ; les noms sont au survol (`detailDuManque`).
/** @param {Preparation} verif */
export function sentenceOfMissing({ missingBindings, missingLabels }) {
  const parts = [
    ...(missingBindings.length > 0 ? [account(missingBindings.length, "binding")] : []),
    ...(missingLabels.length > 0 ? [account(missingLabels.length, "label")] : []),
  ];
  return `Not set up for Brigade: ${parts.length === 0 ? "its setup is incomplete" : `${parts.join(" and ")} missing`}.`;
}

/** @param {Preparation} verif */
export const detailOfMissing = ({ missingBindings, missingLabels }) =>
  [...(missingBindings.length > 0 ? [`bindings: ${missingBindings.join(", ")}`] : []), ...(missingLabels.length > 0 ? [`labels: ${missingLabels.join(", ")}`] : [])].join(" — ");

// La phrase d'un refus : une seule, jamais le détail brut d'une erreur.
/** @param {unknown} error */
export function sentenceOfRefusal(error) {
  const raw = (error instanceof Error ? error.message : typeof error === "string" ? error : "").trim();
  const sentence = raw.split(/\r?\n/)[0] ?? "";
  return sentence === "" ? "The setup failed." : sentence;
}

/** @param {Fabrique} doc @param {string} balise @param {string} [text] */
function created(doc, balise, text) {
  const pose = doc.createElement(balise);
  if (text !== undefined) pose.textContent = text;
  return pose;
}

// L'avis dans son état, ou rien : un projet préparé, ou pas encore lu, ne montre rien.
/** @param {Fabrique} doc @param {Place} place @param {State} state @param {() => void} prepare @returns {any | undefined} */
export function setOpinionOfRepository(doc, place, state, prepare) {
  if (state.etape === "inconnu" || state.etape === "prepare") return undefined;
  const root = created(doc, "div");
  root.className = "avis-depot";
  root.ariaLabel = TITLE;
  root.dataset.lieu = place;
  root.dataset.etape = state.etape;
  const head = created(doc, "p");
  head.className = "dit";
  head.append(created(doc, "strong", sentenceOfMissing(state.verif)));
  const detail = detailOfMissing(state.verif);
  if (detail !== "") head.append(hover(doc, detail));
  const control = created(doc, "div");
  control.className = "controle";
  const group = buttonAction(doc, state.etape === "refus" ? RETRY : PREPARE, prepare, { recommande: true });
  const button = group.children?.[0];
  if (button !== undefined) {
    button.dataset.geste = "preparer-le-depot";
    button.disabled = state.etape === "en-route";
  }
  control.append(group);
  if (state.etape === "en-route") {
    const part = created(doc, "span", IN_ROUTE);
    part.className = "en-route";
    control.append(part);
  }
  if (state.etape === "refus") {
    control.append(lineError(doc, state.dit, "", { classe: "refus", balise: "span", alerte: true }));
  }
  root.append(head, control);
  return root;
}
