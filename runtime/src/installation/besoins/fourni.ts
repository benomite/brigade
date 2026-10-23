// Ce que la station fournit à un projet : ce que sa machine a (une commande
// dans son PATH, un dossier de navigateurs, un SDK nommé par une variable), et
// ce que le projet déclare pour ses stations d'ici (`BRIGADE_STATIONS`, leurs
// capacités). La machine est regardée, pas jouée — sauf un service (une base
// de données, Redis, Docker) dont elle a les binaires : son essai se joue
// alors sous le compte de la station, celui sous lequel la cuisine cuit, et
// c'est lui qui dit si elle le fournit (#1532). Son verdict vaut un moment :
// une lecture de la station sur deux ou trois ne relance aucun process.
import { readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
import { capacite } from "../../capacites.ts";
import { lireLesDecisions } from "../../decisions.ts";
import { spawnSync } from "../../sans-invite.ts";
import { lireStations, VARIABLE_DES_STATIONS } from "../../stations-declarees.ts";
import { besoinNomme, type Besoin, type Jouer } from "./catalogue.ts";

// Ce que la détection demande à la machine, remplaçable par un test.
export type Sonde = {
  // La commande est-elle dans le PATH, exécutable ?
  commande: (nom: string) => boolean;
  // Le dossier existe-t-il, non vide ?
  dossier: (chemin: string) => boolean;
  // Joue une commande sous le compte de la station.
  jouer: Jouer;
  // Rend le verdict de l'essai d'un besoin — gardé un moment par la machine.
  essayer: (besoin: string, essai: () => boolean) => boolean;
  env: Record<string, string | undefined>;
  maison: string;
};

// Combien de temps le verdict d'un essai vaut, et combien de temps une de ses
// commandes peut prendre avant d'être arrêtée — un serveur qui ne répond pas
// n'arrête pas la station.
export const ESSAI_VALABLE_MS = 120_000;
const COMMANDE_D_ESSAI_MS = 15_000;

function executable(chemin: string, windows: boolean): boolean {
  try {
    const lu = statSync(chemin);
    return lu.isFile() && (windows || (lu.mode & 0o111) !== 0);
  } catch {
    return false;
  }
}

// La machine elle-même, telle que son environnement la décrit.
export function sondeDeLaMachine(env: Record<string, string | undefined> = process.env, plateforme: NodeJS.Platform = process.platform, maintenant: () => number = Date.now): Sonde {
  const windows = plateforme === "win32";
  const dossiers = (env.PATH ?? env.Path ?? "").split(windows ? ";" : delimiter).filter(Boolean);
  const extensions = windows ? ["", ...(env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";").filter(Boolean)] : [""];
  const verdicts = new Map<string, { fourni: boolean; le: number }>();
  return {
    commande: (nom) => dossiers.some((dossier) => extensions.some((extension) => executable(join(dossier, `${nom}${extension}`), windows))),
    dossier: (chemin) => {
      try {
        return readdirSync(chemin).length > 0;
      } catch {
        return false;
      }
    },
    jouer: (commande, args) => {
      const joue = spawnSync(commande, args, { env, encoding: "utf8", timeout: COMMANDE_D_ESSAI_MS, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
      return { code: joue.error === undefined ? joue.status : null, sortie: `${joue.stdout ?? ""}${joue.stderr ?? ""}` };
    },
    essayer: (besoin, essai) => {
      const deja = verdicts.get(besoin);
      if (deja !== undefined && maintenant() - deja.le < ESSAI_VALABLE_MS) return deja.fourni;
      const fourni = essai();
      verdicts.set(besoin, { fourni, le: maintenant() });
      return fourni;
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

// La station a-t-elle ce besoin ? Une seule preuve suffit : une capacité
// déclarée, ou la machine qui l'a — et, pour un service, son essai réussi
// sous le compte de la station.
export function aLeBesoin(besoin: Besoin, sonde: Sonde, fournit: readonly string[]): boolean {
  if (fournitLaCapacite(besoin, fournit)) return true;
  const { essai } = besoin.fourni;
  if (!laMachineLA(besoin, sonde)) return false;
  return essai === undefined || sonde.essayer(besoin.id, () => essai(sonde.jouer));
}

function laMachineLA(besoin: Besoin, sonde: Sonde): boolean {
  const { commandes, dossiers, variables } = besoin.fourni;
  return (
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

// Le setup du projet peut-il l'apporter lui-même sans que rien ne soit
// installé sur la station (#1534) ? Oui quand elle a déjà ce dont il se sert :
// une de ses commandes (les binaires d'un serveur qu'il démarre pour lui), ou
// un Docker qui répond au compte de la cuisine, pour un service qu'il peut
// démarrer en conteneur.
export function apportableSansInstaller(besoin: Besoin, sonde: Sonde, fournit: readonly string[]): boolean {
  const { commandes, conteneur } = besoin.apporte;
  if ((commandes ?? []).some((commande) => sonde.commande(commande))) return true;
  const docker = besoinNomme("docker");
  return conteneur === true && docker !== null && besoin.id !== docker.id && aLeBesoin(docker, sonde, fournit);
}
