// La barre d'icônes : chaque projet y est un monogramme, tiré de son nom et de
// lui seul — rien n'y est lu de sa station. Deux projets peuvent porter le même :
// c'est le nom, dit en entier au survol et en tête de l'espace, qui les sépare.
import type { Configuration, Projet } from "./config.ts";
import { majuscules } from "./format.ts";

// `ici` : sa cuisine tourne sur cet ordinateur — il se lit ici, sans `ssh` (poste/cuisine-ici.ts).
export type Affichee = Omit<Configuration, "projets"> & { projets: (Projet & { monogramme: string; ici?: true })[] };

// L'initiale des deux premiers mots du nom ; d'un seul mot, ses deux premières lettres.
export function monogramme(nom: string): string {
  const mots = nom.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const [premier, second] = mots.map((mot) => [...mot]);
  const pris = premier === undefined ? [...nom.trim()].slice(0, 2) : second === undefined ? premier.slice(0, 2) : [premier[0], second[0]];
  return majuscules(pris.join(""));
}

// Ce que la vue reçoit du fichier des projets : le même, et un monogramme par projet.
// `vu` : chaque projet tel que l'app le montre — sans sa station, pour celui qu'elle vient d'en
// désinstaller (retrait.ts). `ici` : ceux dont la cuisine tourne sur cet ordinateur.
export function pourLaBarre(configuration: Configuration, vu: (projet: Projet) => Projet = (projet) => projet, ici: (nom: string) => boolean = () => false): Affichee {
  return {
    ...configuration,
    projets: configuration.projets.map((projet) => {
      const montre = vu(projet);
      return { ...montre, monogramme: monogramme(projet.nom), ...(montre.desinstalle === undefined && ici(projet.nom) ? { ici: true as const } : {}) };
    }),
  };
}
