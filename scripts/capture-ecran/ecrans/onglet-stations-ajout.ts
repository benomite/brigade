// L'onglet Stations de « parade » (#2487), « Add a station » cliqué : le parcours s'ouvre dans l'onglet — ce Mac d'abord,
// recommandé, puis atelier, la station appairée qui ne cuit pas parade ; parade-box, à qui il est déjà choisi, n'y est pas.
import { ongletStations } from "./onglet-stations-commun.ts";

export const ecran = ongletStations("L'onglet Stations de « parade », « Add a station » cliqué : ce Mac proposé d'abord, puis atelier ; cancel", [{ cliquer: '#rail .ajouter-une-station button' }]);
