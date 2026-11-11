// L'onglet Stations de « parade » (#3195), cuit par sa box en ligne : « Cooked by parade-box · online · 1 cook at work », en
// vert ; une seule carte, la box, qui cuit #14, ses deux gestes et « Details » replié. Ce Mac, qui ne le sert pas, n'y est pas.
import { BOX, CONFIE, MAC, ongletDesStations } from "./stations-tab-commun.ts";

export const ecran = ongletDesStations("L'onglet Stations de « parade », cuit par sa box : « Cooked by parade-box · online », une carte, « Details » replié (#3195)", { stations: [BOX, MAC], projet: CONFIE, cuit: true });
