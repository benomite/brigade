// La barre d'icônes : chaque projet y est son sigle (acronym.ts), tiré des noms déclarés ou écrit par le chef —
// rien n'y est lu de sa station. Au survol de sa case, et en tête de son espace, son nom se lit en entier.
import type { Configuration, Project } from "./config.ts";
import { close, type Role } from "./colors.ts";
import { acronyms } from "./acronym.ts";

// `ici` : sa cuisine tourne sur cet ordinateur — il se lit ici.
// `etiquette` : ce que sa case écrit — son sigle, trois signes au plus, qu'aucun autre projet n'a.
// `proches` : par rôle, ce qu'une couleur libre du projet a de trop proche (colors.ts), en une ligne.
export type Shown = Omit<Configuration, "projets"> & { projets: (Project & { etiquette: string; servi?: true; ici?: true; sansStation?: true; redemarre?: string; proches?: Partial<Record<Role, string>> })[] };

// Ce que la vue reçoit du fichier des projets : le même, le sigle de chaque projet, et ce que ses
// couleurs libres ont de trop proche d'une couleur d'état ou de celles des autres projets.
// `servi` : ceux qu'une station sert, ici ou ailleurs : leur rail se lit. `ici` : ceux dont la cuisine tourne sur cet ordinateur. `stationTourne` :
// la station de cet ordinateur tourne-t-elle ? Sinon, ceux de `ici` portent `sansStation` : rien ne
// peut être lu de leur cuisine, et leur page le dit en une ligne. `redemarrage` : la version que la mise à jour de la station
// de cet ordinateur vise tant qu'elle la redémarre (#3637) ; ceux de `ici` portent alors `redemarre`, cette version : leur station
// n'est pas hors ligne, elle se relance.
export function forTheBar(configuration: Configuration, served: (project: Project) => boolean = () => false, here: (name: string) => boolean = () => false, stationRuns: () => boolean = () => true, restart: () => string | null = () => null): Shown {
  const labels = acronyms(configuration.projets);
  const version = restart();
  return {
    ...configuration,
    projets: configuration.projets.map((project) => {
      const cookedHere = here(project.nom);
      const said = close(project, configuration.projets);
      return { ...project, etiquette: labels.get(project.nom) ?? project.nom, ...(served(project) ? { servi: true as const } : {}), ...(cookedHere ? { ici: true as const } : {}), ...(cookedHere && !stationRuns() && version === null ? { sansStation: true as const } : {}), ...(cookedHere && version !== null ? { redemarre: version } : {}), ...(said === undefined ? {} : { proches: said }) };
    }),
  };
}
