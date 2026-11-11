// L'onglet Stations de « parade » (#3195), sa cuisine en route vers ce Mac depuis trois minutes : « Moving from parade-box
// to macbook: waiting for macbook to take the kitchen over, since 10:01 UTC », et, passée la minute, ce qui le bloque. Ce
// Mac a sa carte, qui démarre.
import { BOX, CONFIE, MAC, ongletDesStations, VERS_CE_MAC } from "./stations-tab-commun.ts";

export const ecran = ongletDesStations("L'onglet Stations de « parade », son déménagement vers ce Mac en route depuis trois minutes : « Moving from … », et ce qui le bloque (#3195)", { stations: [BOX, MAC], projet: { ...CONFIE, demenagement: VERS_CE_MAC } });
