// la page d'une station en ligne, « remove the station » cliqué : la confirmation, qui dit ce que ça change.
import { pageDeStation } from "./station-pannes.ts";

export const ecran = pageDeStation("en-ligne", "la page d'une station en ligne, « remove the station » cliqué : sa confirmation", [{ cliquer: "#station .retrait-de-station button" }]);
