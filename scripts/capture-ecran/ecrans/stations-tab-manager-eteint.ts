// L'onglet Stations de « parade », cuit par sa box en ligne mais son projet éteint (#3454) : la ligne du haut dit que le projet
// est éteint, jamais « Cooked by » ni « cooks this project ».
import { rendus } from "./manager-eteint-commun.ts";
import { BOX, CONFIE, MAC, ongletDesStations } from "./stations-tab-commun.ts";

export const ecran = ongletDesStations("L'onglet Stations de « parade », sa box en ligne mais le projet éteint : « Project off — nothing new is taken, split or merged » (#3454)", { stations: [BOX, MAC], projet: CONFIE, cuit: true, rendus: rendus(false) });
