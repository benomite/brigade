// La barre d'icônes : chaque projet y est un monogramme, tiré de son nom et de
// lui seul — rien n'y est lu de sa station. Deux projets peuvent porter le même :
// c'est le nom, dit en entier au survol et en tête de l'espace, qui les sépare.
import type { Configuration, Projet } from "./config.ts";
import { proches, type Role } from "./couleurs.ts";
import { majuscules } from "./format.ts";

// `ici` : sa cuisine tourne sur cet ordinateur — il se lit ici (poste/cuisine-ici.ts).
// `proches` : par rôle, ce qu'une couleur libre du projet a de trop proche (couleurs.ts), en une ligne.
export type Affichee = Omit<Configuration, "projets"> & { projets: (Projet & { monogramme: string; servi?: true; ici?: true; sansStation?: true; proches?: Partial<Record<Role, string>> })[] };

// L'initiale des deux premiers mots du nom ; d'un seul mot, ses deux premières lettres.
export function monogramme(nom: string): string {
  const mots = nom.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const [premier, second] = mots.map((mot) => [...mot]);
  const pris = premier === undefined ? [...nom.trim()].slice(0, 2) : second === undefined ? premier.slice(0, 2) : [premier[0], second[0]];
  return majuscules(pris.join(""));
}

// Ce que la vue reçoit du fichier des projets : le même, un monogramme par projet, et ce que ses
// couleurs libres ont de trop proche d'une couleur d'état ou de celles des autres projets.
// `servi` : ceux qu'une station sert, ici ou ailleurs : leur rail se lit. `ici` : ceux dont la cuisine tourne sur cet ordinateur. `stationTourne` :
// la station de cet ordinateur tourne-t-elle ? Sinon, ceux de `ici` portent `sansStation` : rien ne
// peut être lu de leur cuisine, et leur page le dit en une ligne.
export function pourLaBarre(configuration: Configuration, servi: (projet: Projet) => boolean = () => false, ici: (nom: string) => boolean = () => false, stationTourne: () => boolean = () => true): Affichee {
  return {
    ...configuration,
    projets: configuration.projets.map((projet) => {
      const cuitIci = ici(projet.nom);
      const dit = proches(projet, configuration.projets);
      return { ...projet, ...(servi(projet) ? { servi: true as const } : {}), monogramme: monogramme(projet.nom), ...(cuitIci ? { ici: true as const } : {}), ...(cuitIci && !stationTourne() ? { sansStation: true as const } : {}), ...(dit === undefined ? {} : { proches: dit }) };
    }),
  };
}
