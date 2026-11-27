// @ts-check
// La ligne d'un projet en lecture seule (ticket 3163) : le compte GitHub de cet ordinateur ne peut pas écrire dans son
// dépôt. Elle se pose en tête du projet, dans sa bande, et dit en mots simples pourquoi aucun geste n'y est offert ; deux
// liens à côté : comment obtenir l'écriture, ou forker le dépôt. Ce module ne touche pas `document` : il reçoit de quoi
// créer un élément.

import { button } from "../components/button/button.js";

/** @typedef {{ createElement(balise: string): any }} Fabrique */
/** @typedef {"acces" | "fork"} Page */

/** @param {string} repository */
export const READ_ONLY = (repository) => `Read-only: your GitHub account cannot write to ${repository}.`;
export const GET_THE_ACCESS = "how to get write access";
export const FORKER = "fork it";

// La ligne, et ses deux liens. `ouvrir` : la page que le lien demande, ouverte par le process principal.
/** @param {Fabrique} doc @param {string} repository @param {(page: Page) => void} open */
export function lineReadOnly(doc, repository, open) {
  const line = doc.createElement("div");
  line.className = "lecture-seule";
  const said = doc.createElement("p");
  said.textContent = READ_ONLY(repository);
  const access = button(doc, GET_THE_ACCESS, () => open("acces"), { sorte: "discret" });
  access.title = `the owner of ${repository} invites your GitHub account as a collaborator: GitHub's page explains how, in the browser`;
  access.dataset.lien = "acces";
  const fork = button(doc, FORKER, () => open("fork"), { sorte: "discret" });
  fork.title = `fork ${repository} on GitHub, in the browser: your copy is one you can write to`;
  fork.dataset.lien = "fork";
  line.append(said, access, fork);
  return line;
}
