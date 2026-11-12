// L'onglet Stations de « parade » (#3195), qu'aucune station ne sert : « No station cooks this project · 2 fire tickets
// waiting », « Cook it on this computer » (#3399) puis « Choose who cooks it » ; aucune carte, et aucune des stations appairées nommée.
import { BOX, CONFIE, MAC, ongletDesStations } from "./stations-tab-commun.ts";

export const ecran = ongletDesStations("L'onglet Stations de « parade », qu'aucune station ne sert : « No station cooks this project · 2 fire tickets waiting », « Cook it on this computer » (#3195, #3399)", { stations: [{ ...BOX, projets: [] }, MAC], projet: { ...CONFIE, suiviPar: undefined, stations: [], cuitSur: null } as never });
