// « Tous les projets », les stations du chef telles qu'il les a vues (#1778, épique #1777) : chaque machine appairée
// publie sa présence, et s'est aussi enregistrée sous le compte GitHub. parade-box fait la cuisine de cinq projets, mais
// rien ne lui est choisi dans l'app ; macbook-air-de-benoit ne fait la cuisine d'aucun, mais un dépôt lui est choisi ;
// nas n'est qu'enregistrée. Avant #1778, la section les listait deux fois, et les deux lectures se contredisaient.
import { type Home, lineOfStation } from "../../../app/src/home.ts";
import type { StationVue, SeenOfStations } from "../../../app/src/stations/stations.ts";
import type { StationRecorded, StationsOfAccount } from "../../../app/src/stations-of-account.ts";
import { configuration, cuisine, demarrage, type Ecran, type Etape, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

const INSTANT = Date.parse(MAINTENANT);
const IL_Y_A = (minutes: number) => new Date(INSTANT - minutes * 60_000).toISOString();

// Ce que les gists de présence disent, tel que l'app le lit (stations/stations.ts).
const BOX: StationVue = { id: "f0a1", nom: "parade-box", machine: "Debian 12 · 8 cores", coeurs: 8, etat: "en-ligne", ligne: "", dit: "online", version: "2.4.0", projets: ["brigade", "calculus-workspace", "espace", "mirrorscreen", "mirrorlab"], max: null };
const MAC: StationVue = { id: "f0b2", nom: "macbook-air-de-benoit", machine: "macOS 15 · 8 cores", coeurs: 8, etat: "en-ligne", ligne: "", dit: "online", version: "2.4.0", projets: [], max: null };
const STATIONS: SeenOfStations = { a: MAINTENANT, stations: [MAC, BOX] };

// Ce que les gists d'enregistrement disent, tel que l'app le reçoit (`StationRecorded`) : chacune vue il y a une minute,
// disponible ; `selection`, les dépôts choisis pour elle, null sans sélection écrite.
const enregistree = (id: string, name: string, platform: string, machine: string, selection: string[] | null): StationRecorded => ({
  id,
  name,
  platform,
  machine,
  version: "2.4.0",
  account: "benomite",
  available: true,
  registeredAt: "2026-10-01T08:00:00.000Z",
  lastSeen: IL_Y_A(1),
  stoppedAt: null,
  refreshMs: 120_000,
  selection,
});
const MAC_ENREGISTRE = enregistree("e1c3", "macbook-air-de-benoit", "macos", "macOS 24.1.0", ["benomite/brigade"]);
const NAS = enregistree("e2d4", "nas", "linux", "Linux 6.1.0", null);
const BOX_ENREGISTREE = enregistree("e3e5", "parade-box", "linux", "Linux 6.1.0", null);
const DU_COMPTE: StationsOfAccount = { state: "listed", stations: [MAC_ENREGISTRE, NAS, BOX_ENREGISTREE], unreadable: [] };

const DEPOTS = { depots: ["benomite/brigade", "benomite/parade", "benomite/cantine"].map((depot) => ({ depot, base: "main" })) };

// `etapes` : ce que la capture clique avant de rendre l'écran. `depots` : les dépôts que le compte du chef atteint.
export function stationsDuChef(dit: string, etapes: Etape[] = [], depots: { depots: Array<{ depot: string; base: string }> } = DEPOTS): Ecran {
  return {
    dit,
    largeur: 1440,
    hauteur: 900,
    etapes,
    donnees: () => {
      const accueil: Home = { projets: [], stations: STATIONS.stations.map((station) => lineOfStation(station, 0, [])), sante: { ton: "vert", dit: "Max ✓  ·  GitHub ✓", survol: "" } };
      return { maintenant: MAINTENANT, reponses: { demarrage: { ...demarrage(configuration(PROJETS)), stations: STATIONS, accueil }, stationsDuCompte: DU_COMPTE, depotsDuChef: depots }, envois: cuisine(RENDUS) };
    },
  };
}

export const ecran = stationsDuChef("« Tous les projets » : les stations du chef, appairées et enregistrées sous son compte GitHub — parade-box, macbook-air-de-benoit, et nas, seulement enregistrée (#1778)");
