// Les stations du projet, telles que la panne les juge (#4214) : celles qui le servent (`servantesDe`), chacune en marche
// quand elle est disponible — ni arrêtée, ni muette. Des stations qui ne se lisent pas ne se jugent pas : null.
import { disponible } from "../enregistrement-station/contrat.ts";
import { stationDe } from "../stations-github/stations.ts";
import { servantesDe, type StationsLues } from "../attente-du-rail/stations.ts";
import type { OutageStation } from "./index.ts";

export function outageStations(stations: StationsLues, depot: string, maintenant: number): OutageStation[] | null {
  if ("illisibles" in stations) return null;
  return servantesDe(stations.lues, depot, maintenant).map((station) => ({ nom: stationDe(station.name), enMarche: disponible(station, maintenant) }));
}
