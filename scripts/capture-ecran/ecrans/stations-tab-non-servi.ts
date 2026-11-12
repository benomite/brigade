// L'onglet Stations de « parade » (#3399), que la station de ce Mac ne sert pas — sa liste ne porte que « cantine » —, alors que
// sa cuisine tourne ici et que `facts` y nomme sa ligne, au repos : 8 tickets `fire` attendent sur le rail.
import type { Faits } from "../../../app/src/faits.ts";
import type { Rendu } from "./commun.ts";
import { RENDUS } from "./cuisine-figee.ts";
import { BOX, CONFIE, MAC, ongletDesStations } from "./stations-tab-commun.ts";

const PARADE = RENDUS.parade as Rendu;
const ligne = { station: "macbook/claude", distante: false, plafond: 2, ordinaires: false, bacASable: null, prendOrdinaires: true, cuisson: "idle", arreteeDepuis: null, refus: null, presente: true, cooks: [] };
const facts = { ...PARADE.facts, compteurs: { ...PARADE.facts.compteurs, rail: 8, auTravail: 0, aLaPass: 0 }, cooks: [], stations: [ligne] } as unknown as Faits;

export const ecran = ongletDesStations("L'onglet Stations de « parade », que ce Mac fait tourner sans le servir : « No station cooks this project · 8 fire tickets waiting », « Cook it on this computer » (#3399)", {
  stations: [{ ...BOX, projets: [] }, MAC],
  projet: { ...CONFIE, suiviPar: undefined, stations: [], cuitSur: null } as never,
  ici: true,
  servisIci: ["chef/cantine"],
  facts,
});
