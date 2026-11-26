// @ts-check
// L'avis d'un projet qui n'est pas préparé pour Brigade (ticket 2628, épique 2584) : sur sa page et dans son TODO, une
// phrase — ce qui manque — et un seul bouton, le geste de l'ajout d'un projet (`runRepoSetup`). Un projet préparé n'a
// rien de nouveau : aucun avis. `/brigade:init` n'est jamais montré.
//
// Pendant la préparation, le bouton attend et l'avis dit qu'elle est en route ; ratée, il dit en une phrase pourquoi
// et « Retry » est rendu. Réussie, l'avis s'en va sans recharger : la vue le retire à la lecture qui suit.
//
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js) et ce que le clic appelle, et
// rend des éléments. La vue tient l'état, projet par projet.

import { buttonAction, survol } from "./../briques.js";
import { lineError } from "../composants/line-error/line-error.js";
import { REESSAYER } from "../lexique.js";

/** @typedef {import("./../briques.js").Fabrique} Fabrique */
/** @typedef {{ ready: boolean, missingBindings: string[], missingLabels: string[] }} Preparation */

// Où l'avis est posé : la page du projet, ou son TODO.
/** @typedef {"page" | "todo"} Lieu */

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
export const INCONNU = { etape: "inconnu" };

export const PREPARER = "Set up for Brigade";
export { REESSAYER };
export const EN_ROUTE = "setting the project up…";
export const TITRE = "this project is not set up for Brigade";

/** @param {number} n @param {string} word */
const account = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// L'état qui suit la lecture de la préparation.
/** @param {Preparation} verif @returns {State} */
export function apresLaRead(verif) {
  return verif.ready ? { etape: "prepare" } : { etape: "manque", verif };
}

// La phrase de ce qui manque ; les noms sont au survol (`detailDuManque`).
/** @param {Preparation} verif */
export function phraseDuManque({ missingBindings, missingLabels }) {
  const parts = [
    ...(missingBindings.length > 0 ? [account(missingBindings.length, "binding")] : []),
    ...(missingLabels.length > 0 ? [account(missingLabels.length, "label")] : []),
  ];
  return `Not set up for Brigade: ${parts.length === 0 ? "its setup is incomplete" : `${parts.join(" and ")} missing`}.`;
}

/** @param {Preparation} verif */
export const detailDuManque = ({ missingBindings, missingLabels }) =>
  [...(missingBindings.length > 0 ? [`bindings: ${missingBindings.join(", ")}`] : []), ...(missingLabels.length > 0 ? [`labels: ${missingLabels.join(", ")}`] : [])].join(" — ");

// La phrase d'un refus : une seule, jamais le détail brut d'une erreur.
/** @param {unknown} error */
export function phraseDuRefusal(error) {
  const brut = (error instanceof Error ? error.message : typeof error === "string" ? error : "").trim();
  const phrase = brut.split(/\r?\n/)[0] ?? "";
  return phrase === "" ? "The setup failed." : phrase;
}

/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

// L'avis dans son état, ou rien : un projet préparé, ou pas encore lu, ne montre rien.
/** @param {Fabrique} doc @param {Lieu} lieu @param {State} state @param {() => void} preparer @returns {any | undefined} */
export function poserOpinionDeRepository(doc, lieu, state, preparer) {
  if (state.etape === "inconnu" || state.etape === "prepare") return undefined;
  const racine = cree(doc, "div");
  racine.className = "avis-depot";
  racine.ariaLabel = TITRE;
  racine.dataset.lieu = lieu;
  racine.dataset.etape = state.etape;
  const tete = cree(doc, "p");
  tete.className = "dit";
  tete.append(cree(doc, "strong", phraseDuManque(state.verif)));
  const detail = detailDuManque(state.verif);
  if (detail !== "") tete.append(survol(doc, detail));
  const controle = cree(doc, "div");
  controle.className = "controle";
  const groupe = buttonAction(doc, state.etape === "refus" ? REESSAYER : PREPARER, preparer, { recommande: true });
  const button = groupe.children?.[0];
  if (button !== undefined) {
    button.dataset.geste = "preparer-le-depot";
    button.disabled = state.etape === "en-route";
  }
  controle.append(groupe);
  if (state.etape === "en-route") {
    const part = cree(doc, "span", EN_ROUTE);
    part.className = "en-route";
    controle.append(part);
  }
  if (state.etape === "refus") {
    controle.append(lineError(doc, state.dit, "", { classe: "refus", balise: "span", alerte: true }));
  }
  racine.append(tete, controle);
  return racine;
}
