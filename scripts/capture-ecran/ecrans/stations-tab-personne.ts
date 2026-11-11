// L'onglet Stations de « parade » (#3195), qu'aucune station ne sert : « Nobody cooks this project », un seul bouton,
// « Choose who cooks it » ; aucune carte, et aucune des stations appairées nommée.
import { BOX, CONFIE, MAC, ongletDesStations } from "./stations-tab-commun.ts";

export const ecran = ongletDesStations("L'onglet Stations de « parade », qu'aucune station ne sert : « Nobody cooks this project », « Choose who cooks it » (#3195)", { stations: [{ ...BOX, projets: [] }, MAC], projet: { ...CONFIE, suiviPar: undefined, stations: [], cuitSur: null } as never });
