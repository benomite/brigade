// Le choix de la machine qui cuit un projet (#3187) : « parade », qu'aucune station ne cuit encore, « choose its machine »
// cliqué. Deux stations appairées : la box, serveur de 8 cœurs, hors ligne depuis 22 min, et ce Mac — la station de cet
// ordinateur —, en ligne, 10 cœurs. La recommandation est celle que le process principal calcule (`stationRecommandee`).
import { calibrageRecommande, machineProposee, stationRecommandee, type VuDesProjets } from "../../../app/src/projets/projets.ts";
import type { StationVue, VuDesStations } from "../../../app/src/stations/stations.ts";
import type { Ecran } from "./commun.ts";
import { donnees, OUVRIR, SUR_LA_BOX } from "./cuisine-demenagee.ts";

const BOX: StationVue = { id: "box", nom: "box", machine: "Debian 12", coeurs: 8, etat: "hors-ligne", ligne: "offline for 22 min · no project", pannes: [], dit: "offline for 22 min", version: "", projets: ["cantine"], max: null };
const MAC: StationVue = { id: "macbook", nom: "macbook", machine: "macOS 15", coeurs: 10, etat: "en-ligne", ligne: "online · no project", pannes: [], dit: "online", version: "", projets: [], max: null };

export const CHOISIR = { cliquer: "#stations-du-projet button.ajout-de-station:not([hidden])" };

export function sansStation() {
  const tout = donnees(SUR_LA_BOX, { depotsDuChef: { depots: [{ depot: "benomite/parade", base: "main" }] } });
  const lu = tout.reponses.demarrage as { stations: VuDesStations; projetsDesStations: VuDesProjets };
  lu.stations = { a: lu.stations.a, stations: [BOX, MAC] };
  lu.projetsDesStations = { ...lu.projetsDesStations, projets: [], locale: "macbook", recommandee: stationRecommandee([BOX, MAC]) ?? null, machines: { box: machineProposee(BOX), macbook: machineProposee(MAC) }, calibrage: calibrageRecommande([]) };
  return tout;
}

export const ecran: Ecran = {
  dit: "Le choix de la machine qui cuit parade (#3187) : la box hors ligne depuis 22 min, ce Mac en ligne — « choose its machine » cliqué",
  largeur: 1440,
  hauteur: 1000,
  etapes: [OUVRIR, CHOISIR],
  donnees: sansStation,
};
