// La barre d'icônes : chaque projet y est un monogramme, tiré de son nom et de
// lui seul — rien n'y est lu de sa box. Deux projets peuvent porter le même :
// c'est le nom, dit en entier au survol et en tête de l'espace, qui les sépare.
import { boxes, type Configuration, type Projet } from "./config.ts";

// `boxes` : celles que l'écran d'ajout propose (config.ts).
export type Affichee = Omit<Configuration, "projets"> & { projets: (Projet & { monogramme: string })[]; boxes: string[] };

// L'initiale des deux premiers mots du nom ; d'un seul mot, ses deux premières lettres.
export function monogramme(nom: string): string {
  const mots = nom.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const [premier, second] = mots.map((mot) => [...mot]);
  const pris = premier === undefined ? [...nom.trim()].slice(0, 2) : second === undefined ? premier.slice(0, 2) : [premier[0], second[0]];
  return pris.join("").toLocaleUpperCase("fr-FR");
}

// Ce que la vue reçoit du fichier des projets : le même, un monogramme par projet, et ses box.
// `vu` : chaque projet tel que l'app le montre — sans sa box, pour celui qu'elle vient d'en
// désinstaller (retrait.ts). Les box proposées, elles, restent celles du fichier.
export function pourLaBarre(configuration: Configuration, vu: (projet: Projet) => Projet = (projet) => projet): Affichee {
  return { ...configuration, projets: configuration.projets.map((projet) => ({ ...vu(projet), monogramme: monogramme(projet.nom) })), boxes: boxes(configuration) };
}
