// Ce que la mise à jour de la station de l'ordinateur tient, sous le
// répertoire de la station (`<BRIGADE_STATION_DIR>/station-update/`) :
//
//   status.json    où elle en est — la version qui tourne, la plus récente
//                  publiée, le retard —, réécrit à chaque changement : c'est ce
//                  que l'app lit ;
//   restart.json   la demande de relance, posée au premier moment sans cook en
//                  vol, ou à l'échéance une fois leur travail sauvé : la
//                  release à lancer, et son point d'entrée ;
//   releases/      les releases téléchargées, une par version : celle visée,
//                  et celle qui tourne si elle en vient.
//
// Le contrat avec l'app est dans `README.md`, à côté.
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const DOSSIER = "station-update";
export const STATUT = "status.json";
export const RELANCE = "restart.json";
export const RELEASES = "releases";

// « Relance-moi sur la release `version` » : ce que la station demande à
// celui qui la tient. `main` : le point d'entrée à lancer, `runtime` le
// dossier qui le porte ; `from` : la version qui tourne, à relancer si la
// nouvelle ne démarre pas.
export type DemandeDeRelance = { version: string; runtime: string; main: string; from: string; at: string };

export type StatutDeLaStation = {
  // La version qui tourne.
  stationVersion: string;
  // La plus récente des versions publiées, au dernier regard réussi.
  latestStationVersion: string | null;
  // Une version publiée est plus récente que celle qui tourne.
  behind: boolean;
  // Le dernier regard sur les versions publiées.
  checkedAt: string | null;
  // Pourquoi le dernier regard, ou le téléchargement qui l'a suivi, a raté ;
  // nul quand tout s'est fait.
  check: string | null;
  // Pourquoi la version publiée attend, sans échec.
  held: string | null;
  // La release téléchargée et vérifiée, prête à lancer.
  ready: string | null;
  // Une release prête attend le moment de la relance : la station prend encore
  // ses tickets, et dit ses cooks en vol (#2815).
  draining: { since: string; cooks: number[] } | null;
  // La demande de relance, une fois faite.
  restart: DemandeDeRelance | null;
};

export const dossierDe = (racine: string) => join(racine, DOSSIER);

export function statutVierge(version: string): StatutDeLaStation {
  return { stationVersion: version, latestStationVersion: null, behind: false, checkedAt: null, check: null, held: null, ready: null, draining: null, restart: null };
}

const lireJson = (fichier: string): unknown => {
  try {
    return JSON.parse(readFileSync(fichier, "utf8"));
  } catch {
    return null;
  }
};

export function lireStatut(racine: string): StatutDeLaStation | null {
  const lu = lireJson(join(dossierDe(racine), STATUT)) as Partial<StatutDeLaStation> | null;
  if (lu === null || typeof lu !== "object" || typeof lu.stationVersion !== "string" || typeof lu.behind !== "boolean") return null;
  return { ...statutVierge(lu.stationVersion), ...lu };
}

export function lireDemande(racine: string): DemandeDeRelance | null {
  const lu = lireJson(join(dossierDe(racine), RELANCE)) as Partial<DemandeDeRelance> | null;
  if (lu === null || typeof lu !== "object") return null;
  const { version, runtime, main, from, at } = lu;
  return typeof version === "string" && typeof runtime === "string" && typeof main === "string" && typeof from === "string" && typeof at === "string" ? { version, runtime, main, from, at } : null;
}

function ecrireJson(fichier: string, valeur: unknown): void {
  mkdirSync(join(fichier, ".."), { recursive: true });
  writeFileSync(`${fichier}.${process.pid}`, `${JSON.stringify(valeur, null, 2)}\n`);
  renameSync(`${fichier}.${process.pid}`, fichier);
}

export const ecrireStatut = (racine: string, statut: StatutDeLaStation) => ecrireJson(join(dossierDe(racine), STATUT), statut);
export const ecrireDemande = (racine: string, demande: DemandeDeRelance) => ecrireJson(join(dossierDe(racine), RELANCE), demande);
export const effacerDemande = (racine: string) => rmSync(join(dossierDe(racine), RELANCE), { force: true });
