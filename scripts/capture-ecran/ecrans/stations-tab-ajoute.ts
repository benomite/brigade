// L'onglet Stations de « parade » (#3402), cuit par sa box, juste après « Add a station » → « this computer » : la liste de
// la station de ce Mac porte chef/parade, et ce Mac n'a encore rien publié — sa carte est là, en tête, avec ses gestes.
import { BOX, CONFIE, MAC, ongletDesStations } from "./stations-tab-commun.ts";

export const ecran = ongletDesStations("L'onglet Stations de « parade », ce Mac ajouté depuis l'onglet : sa liste porte parade, sa carte est là avant qu'il ne le publie (#3402)", {
  stations: [BOX, MAC],
  projet: CONFIE,
  cuit: true,
  servisIci: ["chef/parade"],
});
