// « Tous les projets » avec deux stations installées qui ne cuisent pas encore (#1758) : l'une hors ligne, l'autre
// sans projet — chaque pastille grise dit pourquoi, et le geste, sur sa ligne.
import { type Accueil, ligneDeStation } from "../../../app/src/accueil.ts";
import type { StationVue, VuDesStations } from "../../../app/src/stations/stations.ts";
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

const BOX: StationVue = { id: "box", nom: "box", machine: "Debian 12 · 8 cores", coeurs: 8, etat: "en-ligne", ligne: "online · 1 project: cantine", pannes: [], dit: "online", version: "", projets: ["cantine"], max: null };
const MAC: StationVue = { id: "macbook", nom: "macbook", machine: "macOS 15 · 10 cores", coeurs: 10, etat: "hors-ligne", ligne: "offline for 12 min · 1 project: cantine", pannes: [], dit: "offline for 12 min", version: "", projets: ["cantine"], max: null };
const NAS: StationVue = { id: "nas", nom: "nas", machine: "Debian 12 · 4 cores", coeurs: 4, etat: "en-ligne", ligne: "online · no project", pannes: [], dit: "online", version: "", projets: [], max: null };
const STATIONS: VuDesStations = { a: MAINTENANT, stations: [BOX, MAC, NAS] };

export const ecran: Ecran = {
  dit: "« Tous les projets » : la box au travail, un Mac hors ligne et un NAS sans projet — chaque pastille grise dit pourquoi, et le geste (#1758)",
  largeur: 1440,
  hauteur: 900,
  etapes: [],
  donnees: () => {
    const lignes: Accueil = { projets: [], stations: STATIONS.stations.map((station) => ligneDeStation(station, 0, false)), sante: { ton: "vert", dit: "Max ✓  ·  GitHub ✓", survol: "" } };
    return { maintenant: MAINTENANT, reponses: { demarrage: { ...demarrage(configuration(PROJETS)), stations: STATIONS, accueil: lignes } }, envois: cuisine(RENDUS) };
  },
};
