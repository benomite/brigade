// @ts-check
// La fiche du projet sous Settings (ticket 4240) : l'écran de card-project.js, monté pour le projet ouvert, par le pont.

import { ouvrirCardProject } from "./card-project.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */

// Monte l'écran dans son conteneur de Settings, pour le projet ouvert, par le pont : sans de quoi lire et écrire un
// fichier du projet (un téléphone), la section ne se pose pas. Le conteneur retient le projet qu'il montre : une lecture
// qui arrive pour un autre, quitté depuis, ne s'y pose pas.
/**
 * @param {Fabrique} doc
 * @param {any} conteneur
 * @param {{ projet: string, pont: Partial<Pick<import("../pont.d.ts").Pont, "lireUnFichierDuProjet" | "ecrireUnFichierDuProjet">> }} options
 */
export async function monterLaCardProject(doc, conteneur, { projet: project, pont }) {
  conteneur.dataset.projet = project;
  conteneur.hidden = true;
  conteneur.replaceChildren();
  const { lireUnFichierDuProjet: lire, ecrireUnFichierDuProjet: ecrire } = pont;
  if (lire === undefined || ecrire === undefined) return;
  const screen = await ouvrirCardProject(doc, { lire: (chemin) => lire(project, chemin), ecrire: (chemin, texte) => ecrire(project, chemin, texte) });
  if (conteneur.dataset.projet !== project) return;
  conteneur.replaceChildren(screen);
  conteneur.hidden = false;
}
