// Ce que la station fournit à un projet : ce que sa machine a (une commande
// dans son PATH, un dossier de navigateurs, un SDK nommé par une variable), et
// ce que le projet déclare pour ses stations d'ici (`BRIGADE_STATIONS`, leurs
// capacités). Rien ne s'exécute : la machine est regardée, pas jouée — ce qui
// se fait à chaque lecture de la station sans lancer un process.
import { readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
import { capacite } from "../../capacites.ts";
import { lireLesDecisions } from "../../decisions.ts";
import { lireStations, VARIABLE_DES_STATIONS } from "../../stations-declarees.ts";
import type { Besoin } from "./catalogue.ts";

// Ce que la détection demande à la machine, remplaçable par un test.
export type Sonde = {
  // La commande est-elle dans le PATH, exécutable ?
  commande: (nom: string) => boolean;
  // Le dossier existe-t-il, non vide ?
  dossier: (chemin: string) => boolean;
  env: Record<string, string | undefined>;
  maison: string;
};

function executable(chemin: string, windows: boolean): boolean {
  try {
    const lu = statSync(chemin);
    return lu.isFile() && (windows || (lu.mode & 0o111) !== 0);
  } catch {
    return false;
  }
}

// La machine elle-même, telle que son environnement la décrit.
export function sondeDeLaMachine(env: Record<string, string | undefined> = process.env, plateforme: NodeJS.Platform = process.platform): Sonde {
  const windows = plateforme === "win32";
  const dossiers = (env.PATH ?? env.Path ?? "").split(windows ? ";" : delimiter).filter(Boolean);
  const extensions = windows ? ["", ...(env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";").filter(Boolean)] : [""];
  return {
    commande: (nom) => dossiers.some((dossier) => extensions.some((extension) => executable(join(dossier, `${nom}${extension}`), windows))),
    dossier: (chemin) => {
      try {
        return readdirSync(chemin).length > 0;
      } catch {
        return false;
      }
    },
    env,
    maison: env.HOME ?? env.USERPROFILE ?? homedir(),
  };
}

// Une station déclarée par le projet, et ce qu'elle fournit.
export type StationVue = { nom: string; fournit: string[] };

// Les stations que le projet déclare, lues dans son journal : celles d'ici —
// qui tournent sur cette machine — et les distantes, qui tournent ailleurs.
// Sans déclaration lisible, aucune.
export function stationsDuProjet(repertoireEtat: string): { ici: StationVue[]; ailleurs: StationVue[] } {
  try {
    const declarees = lireStations({ [VARIABLE_DES_STATIONS]: lireLesDecisions(repertoireEtat).posees.BRIGADE_STATIONS });
    const vue = ({ nom, fournit }: { nom: string; fournit: string[] }) => ({ nom, fournit });
    return { ici: declarees.filter((station) => station.distante !== true).map(vue), ailleurs: declarees.filter((station) => station.distante === true).map(vue) };
  } catch {
    return { ici: [], ailleurs: [] };
  }
}

const fournitLaCapacite = (besoin: Besoin, fournit: readonly string[]) => besoin.fourni.capacites.some((voulue) => fournit.map(capacite).includes(capacite(voulue)));

// La station a-t-elle ce besoin ? Une seule preuve suffit.
export function aLeBesoin(besoin: Besoin, sonde: Sonde, fournit: readonly string[]): boolean {
  const { commandes, dossiers, variables } = besoin.fourni;
  return (
    fournitLaCapacite(besoin, fournit) ||
    commandes.some((commande) => sonde.commande(commande)) ||
    (dossiers?.(sonde.env, sonde.maison) ?? []).some((dossier) => sonde.dossier(dossier)) ||
    (variables ?? []).some((variable) => {
      const chemin = sonde.env[variable];
      return chemin !== undefined && chemin !== "" && sonde.dossier(chemin);
    })
  );
}

// Les autres stations du projet qui le fournissent, par leurs capacités.
export const stationsQuiFournissent = (besoin: Besoin, stations: readonly StationVue[]): string[] => stations.filter((station) => fournitLaCapacite(besoin, station.fournit)).map(({ nom }) => nom);
