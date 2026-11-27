// @ts-check
// La fiche du projet sous Settings (ticket 4240) : l'écran de card-project.js, monté pour le projet ouvert, par le pont.

import { openCardProject } from "./card-project.js";

/** @typedef {import("../bricks.js").Fabrique} Fabrique */

// Monte l'écran dans son conteneur de Settings, pour le projet ouvert, par le pont : sans de quoi lire et écrire un
// fichier du projet (un téléphone), la section ne se pose pas. Le conteneur retient le projet qu'il montre : une lecture
// qui arrive pour un autre, quitté depuis, ne s'y pose pas.
/**
 * @param {Fabrique} doc
 * @param {any} container
 * @param {{ projet: string, pont: Partial<Pick<import("../bridge.d.ts").Bridge, "lireUnFichierDuProjet" | "ecrireUnFichierDuProjet">> }} options
 */
export async function mountTheCardProject(doc, container, { projet: project, pont: bridge }) {
  container.dataset.projet = project;
  container.hidden = true;
  container.replaceChildren();
  const { lireUnFichierDuProjet: read, ecrireUnFichierDuProjet: write } = bridge;
  if (read === undefined || write === undefined) return;
  const screen = await openCardProject(doc, { lire: (path) => read(project, path), ecrire: (path, text) => write(project, path, text) });
  if (container.dataset.projet !== project) return;
  container.replaceChildren(screen);
  container.hidden = false;
}
