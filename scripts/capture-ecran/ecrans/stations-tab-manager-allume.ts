// L'onglet Stations de « parade », cuit par sa box en ligne, son projet allumé (#3454) : « Cooked by parade-box », comme
// avant.
import { rendus } from "./manager-eteint-commun.ts";
import { BOX, CONFIE, MAC, ongletDesStations } from "./stations-tab-commun.ts";

export const ecran = ongletDesStations("L'onglet Stations de « parade », sa box en ligne, le projet allumé : « Cooked by parade-box · online » (#3454)", { stations: [BOX, MAC], projet: CONFIE, cuit: true, rendus: rendus(true) });
