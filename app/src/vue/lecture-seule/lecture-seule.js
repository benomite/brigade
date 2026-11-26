// @ts-check
// La ligne d'un projet en lecture seule (ticket 3163) : le compte GitHub de cet ordinateur ne peut pas écrire dans son
// dépôt. Elle se pose en tête du projet, dans sa bande, et dit en mots simples pourquoi aucun geste n'y est offert ; deux
// liens à côté : comment obtenir l'écriture, ou forker le dépôt. Ce module ne touche pas `document` : il reçoit de quoi
// créer un élément.

import { bouton } from "../composants/bouton/bouton.js";

/** @typedef {{ createElement(balise: string): any }} Fabrique */
/** @typedef {"acces" | "fork"} Page */

/** @param {string} depot */
export const LECTURE_SEULE = (depot) => `Read-only: your GitHub account cannot write to ${depot}.`;
export const OBTENIR_L_ACCES = "how to get write access";
export const FORKER = "fork it";

// La ligne, et ses deux liens. `ouvrir` : la page que le lien demande, ouverte par le process principal.
/** @param {Fabrique} doc @param {string} depot @param {(page: Page) => void} ouvrir */
export function ligneLectureSeule(doc, depot, ouvrir) {
  const ligne = doc.createElement("div");
  ligne.className = "lecture-seule";
  const dit = doc.createElement("p");
  dit.textContent = LECTURE_SEULE(depot);
  const acces = bouton(doc, OBTENIR_L_ACCES, () => ouvrir("acces"), { sorte: "discret" });
  acces.title = `the owner of ${depot} invites your GitHub account as a collaborator: GitHub's page explains how, in the browser`;
  acces.dataset.lien = "acces";
  const fork = bouton(doc, FORKER, () => ouvrir("fork"), { sorte: "discret" });
  fork.title = `fork ${depot} on GitHub, in the browser: your copy is one you can write to`;
  fork.dataset.lien = "fork";
  ligne.append(dit, acces, fork);
  return ligne;
}
