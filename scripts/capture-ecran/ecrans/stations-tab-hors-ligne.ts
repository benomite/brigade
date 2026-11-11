// L'onglet Stations de « parade » (#3195), sa box hors ligne depuis trois heures : « parade-box cooks this project, but it is
// offline for 3 h: nothing cooks », sans vert, comment la ramener au survol, et « Move to this computer », d'un clic.
import { BOX, CONFIE, MAC, ongletDesStations } from "./stations-tab-commun.ts";

export const ecran = ongletDesStations("L'onglet Stations de « parade », sa box hors ligne : rien ne cuit, « Move to this computer » d'un clic (#3195)", { stations: [{ ...BOX, etat: "hors-ligne", dit: "offline for 3 h" }, MAC], projet: CONFIE });
