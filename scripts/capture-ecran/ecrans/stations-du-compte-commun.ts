// Les stations enregistrées sous le compte GitHub du chef (#1706), sur « Tous les projets », sous ses stations : chaque
// station écrite par le lecteur du runtime (`stationDuGist`) à partir de son gist, comme l'app la recevra. Les écrans
// `stations-du-compte*` en sont tirés ; la capture « avant » est `tous-les-projets`, le même état sans ce bloc.
import * as contrat from "../../../runtime/src/enregistrement-station/contrat.ts";
import { stationDuGist, type StationEnregistree, type StationsDuCompte } from "../../../runtime/src/enregistrement-station/stations-du-compte.ts";
import { configuration, cuisine, demarrage, type Ecran, type Etape, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

const INSTANT = Date.parse(MAINTENANT);
const IL_Y_A = (minutes: number) => new Date(INSTANT - minutes * 60_000).toISOString();

const enregistrement = (name: string, platform: string, machine: string, lastSeen: string, stoppedAt: string | null) =>
  JSON.stringify({ brigade: "station-registration", format: 1, name, platform, machine, version: "2.4.0", registeredAt: "2026-10-01T08:00:00.000Z", lastSeen, refreshMs: 120_000, stoppedAt });
const selection = (repositories: string[]) => JSON.stringify({ brigade: "station-selection", format: 1, repositories, updatedAt: IL_Y_A(60) });

function lue(id: string, fichiers: Record<string, string>): StationEnregistree {
  const station = stationDuGist(id, fichiers, "benomite", INSTANT);
  if ("illisible" in station) throw new Error(station.illisible);
  return station;
}

// parade-box tourne et sert deux projets ; le Mac s'est arrêté proprement il y a une heure, et rien ne lui est choisi.
export const BOX = lue("a1b2c3", {
  [contrat.FICHIER_ENREGISTREMENT]: enregistrement("parade-box", "linux", "Linux 6.1.0", IL_Y_A(1), null),
  [contrat.FICHIER_SELECTION]: selection(["benomite/parade", "benomite/cantine"]),
});
export const MAC = lue("d4e5f6", { [contrat.FICHIER_ENREGISTREMENT]: enregistrement("mac", "macos", "macOS 24.1.0", IL_Y_A(62), IL_Y_A(60)) });
export const LISTEES: StationsDuCompte = { state: "listed", stations: [BOX, MAC], unreadable: [] };
export const AUCUNE: StationsDuCompte = { state: "listed", stations: [], unreadable: [], reason: "No station is registered under this GitHub account yet." };

// Les dépôts du chef, tels que `depotsDuChef` les rend.
const DEPOTS = { depots: ["benomite/brigade", "benomite/parade", "benomite/cantine", "benomite/site"].map((depot) => ({ depot, base: "main" })) };

// La ligne d'une station, à cliquer pour l'ouvrir.
export const ligne = (station: StationEnregistree): Etape => ({ cliquer: `#accueil-stations .enregistree[data-station="${station.id}"] button.ligne, #accueil-stations button.ligne[data-station="${station.id}"]` });

// « Tous les projets », tel que `tous-les-projets` le montre, et les stations du compte que la vue lit à l'ouverture.
export function stationsDuCompte(dit: string, stations: StationsDuCompte, etapes: Etape[] = []): Ecran {
  return {
    dit,
    largeur: 1440,
    hauteur: 900,
    etapes,
    donnees: () => ({
      maintenant: MAINTENANT,
      reponses: { demarrage: demarrage(configuration(PROJETS)), stationsDuCompte: stations, depotsDuChef: DEPOTS },
      envois: cuisine(RENDUS),
    }),
  };
}
