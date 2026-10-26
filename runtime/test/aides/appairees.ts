// Les gists appairés du compte, tels que `lireLesStationsEtLeursGists` les
// rend, faits à la main : pour chaque station, son état — lu par le vrai
// `stationDuGist` — et ce que l'app lui demande (`brigade-projets.json`).
import assert from "node:assert/strict";
import { FICHIER_APPAIRAGE, FICHIER_STATION } from "../../src/appairage/document.ts";
import { stationDuGist, type StationAppairee } from "../../src/appairage/stations-du-chef.ts";
import { documentDeDemande, FICHIER_PROJETS, type ProjetDemande } from "../../src/projets/demande.ts";
import type { LectureDesAppairees } from "../../src/projets/secondaires.ts";

// `signe` : son dernier signe de vie, en minutes avant l'instant de la
// lecture ; `arretee` : elle s'est arrêtée proprement depuis ; `sorte` : ce
// qu'elle publie être (`telephone` ne cuit pas).
export type Publiee = { id: string; nom: string; projets?: ProjetDemande[]; signe?: number; arretee?: boolean; sorte?: string };

export function lectureDesAppairees(instant: number, ...publiees: Publiee[]): LectureDesAppairees {
  const gists = new Map<string, Record<string, string>>();
  const stations: StationAppairee[] = [];
  for (const { id, nom, projets, signe = 1, arretee = false, sorte } of publiees) {
    const signeDeVie = new Date(instant - signe * 60_000).toISOString();
    const fichiers: Record<string, string> = {
      [FICHIER_STATION]: JSON.stringify({ brigade: "station", format: 1, nom, machine: "macOS 25.0.0", ...(sorte === undefined ? {} : { sorte }), version: "1.4.0", projets: [], signeDeVie, cadenceMs: 285_000, arreteeLe: arretee ? signeDeVie : null }),
      [FICHIER_APPAIRAGE]: "{}",
      ...(projets === undefined ? {} : { [FICHIER_PROJETS]: documentDeDemande(projets) }),
    };
    const station = stationDuGist(id, fichiers, instant);
    assert.ok(!("illisible" in station), JSON.stringify(station));
    stations.push(station);
    gists.set(id, fichiers);
  }
  return { etat: { state: "listed", stations, unreadable: [] }, gists };
}
