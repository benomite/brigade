// « Tous les projets », les stations du chef telles qu'il les a vues (#1778, épique #1777) : chaque machine appairée
// publie sa présence, et s'est aussi enregistrée sous le compte GitHub. parade-box fait la cuisine de cinq projets, mais
// rien ne lui est choisi dans l'app ; macbook-air-de-benoit ne fait la cuisine d'aucun, mais un dépôt lui est choisi ;
// nas n'est qu'enregistrée. Avant #1778, la section les listait deux fois, et les deux lectures se contredisaient.
import { type Accueil, ligneDeStation } from "../../../app/src/accueil.ts";
import type { StationVue, VuDesStations } from "../../../app/src/stations/stations.ts";
import * as contrat from "../../../runtime/src/enregistrement-station/contrat.ts";
import { stationDuGist, type StationEnregistree, type StationsDuCompte } from "../../../runtime/src/enregistrement-station/stations-du-compte.ts";
import { configuration, cuisine, demarrage, type Ecran, type Etape, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

const INSTANT = Date.parse(MAINTENANT);
const IL_Y_A = (minutes: number) => new Date(INSTANT - minutes * 60_000).toISOString();

// Ce que les gists de présence disent, tel que l'app le lit (stations/stations.ts).
const BOX: StationVue = { id: "f0a1", nom: "parade-box", machine: "Debian 12 · 8 cores", coeurs: 8, etat: "en-ligne", ligne: "", pannes: [], dit: "online", version: "2.4.0", projets: ["brigade", "calculus-workspace", "espace", "mirrorscreen", "mirrorlab"], max: null };
const MAC: StationVue = { id: "f0b2", nom: "macbook-air-de-benoit", machine: "macOS 15 · 8 cores", coeurs: 8, etat: "en-ligne", ligne: "", pannes: [], dit: "online", version: "2.4.0", projets: [], max: null };
const STATIONS: VuDesStations = { a: MAINTENANT, stations: [MAC, BOX] };

// Ce que les gists d'enregistrement disent, écrits par le lecteur du runtime (`stationDuGist`).
const enregistrement = (name: string, platform: string, machine: string) =>
  JSON.stringify({ brigade: "station-registration", format: 1, name, platform, machine, version: "2.4.0", registeredAt: "2026-10-01T08:00:00.000Z", lastSeen: IL_Y_A(1), refreshMs: 120_000, stoppedAt: null });
const selection = (repositories: string[]) => JSON.stringify({ brigade: "station-selection", format: 1, repositories, updatedAt: IL_Y_A(60) });
function lue(id: string, fichiers: Record<string, string>): StationEnregistree {
  const station = stationDuGist(id, fichiers, "benomite", INSTANT);
  if ("illisible" in station) throw new Error(station.illisible);
  return station;
}
const MAC_ENREGISTRE = lue("e1c3", { [contrat.FICHIER_ENREGISTREMENT]: enregistrement("macbook-air-de-benoit", "macos", "macOS 24.1.0"), [contrat.FICHIER_SELECTION]: selection(["benomite/brigade"]) });
const NAS = lue("e2d4", { [contrat.FICHIER_ENREGISTREMENT]: enregistrement("nas", "linux", "Linux 6.1.0") });
const BOX_ENREGISTREE = lue("e3e5", { [contrat.FICHIER_ENREGISTREMENT]: enregistrement("parade-box", "linux", "Linux 6.1.0") });
const DU_COMPTE: StationsDuCompte = { state: "listed", stations: [MAC_ENREGISTRE, NAS, BOX_ENREGISTREE], unreadable: [] };

const DEPOTS = { depots: ["benomite/brigade", "benomite/parade", "benomite/cantine"].map((depot) => ({ depot, base: "main" })) };

// `etapes` : ce que la capture clique avant de rendre l'écran. `depots` : les dépôts que le compte du chef atteint.
export function stationsDuChef(dit: string, etapes: Etape[] = [], depots: { depots: Array<{ depot: string; base: string }> } = DEPOTS): Ecran {
  return {
    dit,
    largeur: 1440,
    hauteur: 900,
    etapes,
    donnees: () => {
      const accueil: Accueil = { projets: [], stations: STATIONS.stations.map((station) => ligneDeStation(station, 0, false)), sante: { ton: "vert", dit: "Max ✓  ·  GitHub ✓", survol: "" } };
      return { maintenant: MAINTENANT, reponses: { demarrage: { ...demarrage(configuration(PROJETS)), stations: STATIONS, accueil }, stationsDuCompte: DU_COMPTE, depotsDuChef: depots }, envois: cuisine(RENDUS) };
    },
  };
}

export const ecran = stationsDuChef("« Tous les projets » : les stations du chef, appairées et enregistrées sous son compte GitHub — parade-box, macbook-air-de-benoit, et nas, seulement enregistrée (#1778)");
