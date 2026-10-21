// Ce que les écrans d'un téléphone appairé partagent (#1162) : les stations du chef, la box, ce Mac et
// un téléphone, qui ne cuisine pas (`cuisine: false`, #1158).
import { type Accueil, ligneDeStation } from "../../../app/src/accueil.ts";
import { calibrageRecommande, machineProposee, type VuDesProjets } from "../../../app/src/projets/projets.ts";
import type { StationVue, VuDesStations } from "../../../app/src/stations/stations.ts";
import { configuration, cuisine, demarrage, type Donnees, MAINTENANT } from "./commun.ts";
import { donnees as donneesDuDemenagement, SUR_LA_BOX } from "./cuisine-demenagee.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

const BOX: StationVue = { id: "box", nom: "box", machine: "Debian 12 · 8 cores", coeurs: 8, etat: "en-ligne", ligne: "online · 1 project: cantine", pannes: [], dit: "online", version: "", projets: ["cantine"], max: null };
const MAC: StationVue = { id: "macbook", nom: "macbook", machine: "macOS 15 · 10 cores", coeurs: 10, etat: "en-ligne", ligne: "online · no project", pannes: [], dit: "online", version: "", projets: [], max: null };
const TELEPHONE: StationVue = { id: "pixel", nom: "pixel", machine: "Android 15", cuisine: false, etat: "en-ligne", ligne: "online · no project", pannes: [], dit: "online", version: "", projets: [], max: null };
export const STATIONS: VuDesStations = { a: MAINTENANT, stations: [BOX, MAC, TELEPHONE] };

// La home, avec le téléphone dans ses stations : chaque ligne vient du code de l'app (accueil.ts).
export function accueil(): Donnees {
  const lignes: Accueil = { projets: [], stations: STATIONS.stations.map((station) => ligneDeStation(station, 0, false)), sante: { ton: "vert", dit: "Max ✓  ·  GitHub ✓", survol: "" } };
  return { maintenant: MAINTENANT, reponses: { demarrage: { ...demarrage(configuration(PROJETS)), stations: STATIONS, accueil: lignes } }, envois: cuisine(RENDUS) };
}

// Le déménagement de parade : le téléphone n'est pas dans les machines à choisir.
export function demenagement(): Donnees {
  const base = donneesDuDemenagement(SUR_LA_BOX);
  const demarrageAvant = base.reponses["demarrage"] as Record<string, unknown>;
  return { ...base, reponses: { ...base.reponses, demarrage: { ...demarrageAvant, stations: STATIONS, projetsDesStations: vuDesProjets() } } };
}

function vuDesProjets(): VuDesProjets {
  return { a: MAINTENANT, projets: [SUR_LA_BOX], locale: "macbook", recommandee: "box", avertissements: {}, machines: { box: machineProposee(BOX), macbook: machineProposee(MAC) }, calibrage: calibrageRecommande([]) };
}
