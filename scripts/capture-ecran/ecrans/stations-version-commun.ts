// « Tous les projets », la version de la station de cet ordinateur à côté de celle de la box (#2191, épique #2182) : les
// stations du chef de `stations-une-liste`, ce Mac nommé comme la station de cet ordinateur (`locale`), parade-box à jour
// sur 2.4.0, et le statut de la station de ce Mac tel que le runtime l'expose (#2189) — ou aucun, quand le pont ne le
// lit pas encore.
import type { VuDesStations } from "../../../app/src/stations/stations.ts";
import type { Ecran } from "./commun.ts";
import { stationsDuChef } from "./stations-une-liste.ts";

export function versionsDesStations(dit: string, statut: { stationVersion: string; latestStationVersion: string; behind: boolean } | undefined, versionDuMac: string): Ecran {
  const base = stationsDuChef(dit);
  return {
    ...base,
    donnees: () => {
      const lu = base.donnees();
      const demarrage = lu.reponses.demarrage as { stations: VuDesStations; projetsDesStations: { locale?: string | null } };
      const stations = demarrage.stations.stations.map((station) =>
        station.nom === "parade-box" ? { ...station, versionDit: "up to date · on this version for 3 days" } : { ...station, version: versionDuMac },
      );
      const mac = stations.find(({ nom }) => nom === "macbook-air-de-benoit");
      return {
        ...lu,
        reponses: {
          ...lu.reponses,
          demarrage: { ...demarrage, stations: { ...demarrage.stations, stations }, projetsDesStations: { ...demarrage.projetsDesStations, locale: mac?.id ?? null } },
          ...(statut === undefined ? {} : { statutDeLaStation: statut }),
        },
      };
    },
  };
}
