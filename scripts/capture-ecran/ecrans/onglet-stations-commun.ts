// L'onglet Stations de « parade » (#2487) : ses deux stations — la box cuit #14, le Mac, distant, arrêté par le chef y
// finit #15 —, puis « Add a station ». Le Mac de l'écran a sa station, qui ne sert pas encore parade (`projetsServis`) ;
// le compte du chef a deux stations appairées : parade-box, à qui parade est choisi, et atelier, à qui rien ne l'est.
import * as contrat from "../../../runtime/src/enregistrement-station/contrat.ts";
import { stationDuGist, type StationEnregistree, type StationsDuCompte } from "../../../runtime/src/enregistrement-station/stations-du-compte.ts";
import { configuration, cuisine, demarrage, type Ecran, type Etape, MAINTENANT, type Rendu } from "./commun.ts";
import { FACTS } from "./cooks-deux-stations.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

const INSTANT = Date.parse(MAINTENANT);
const IL_Y_A = (minutes: number) => new Date(INSTANT - minutes * 60_000).toISOString();
const PARADE = RENDUS.parade as Rendu;

function lue(id: string, name: string, machine: string, repositories: string[]): StationEnregistree {
  const station = stationDuGist(
    id,
    {
      [contrat.FICHIER_ENREGISTREMENT]: JSON.stringify({ brigade: "station-registration", format: 1, name, platform: "linux", machine, version: "2.4.0", registeredAt: "2026-10-01T08:00:00.000Z", lastSeen: IL_Y_A(1), refreshMs: 120_000, stoppedAt: null }),
      [contrat.FICHIER_SELECTION]: JSON.stringify({ brigade: "station-selection", format: 1, repositories, updatedAt: IL_Y_A(60) }),
    },
    "chef",
    INSTANT,
  );
  if ("illisible" in station) throw new Error(station.illisible);
  return station;
}
const COMPTE: StationsDuCompte = { state: "listed", stations: [lue("a1b2c3", "parade-box", "Linux 6.1.0", ["chef/parade"]), lue("f7e8d9", "atelier", "Linux 6.8.0", [])], unreadable: [] };

export function ongletStations(dit: string, etapes: Etape[] = []): Ecran {
  return {
    dit,
    largeur: 1440,
    hauteur: 1000,
    etapes: [{ cliquer: '#projets > button[title^="parade — "]' }, { cliquer: "#onglets-du-projet button:nth-child(2)" }, ...etapes],
    donnees: () => ({
      maintenant: MAINTENANT,
      reponses: { demarrage: demarrage(configuration([{ ...PROJETS[0]!, depot: "chef/parade" }, PROJETS[1]!])), espace: [], projetsServis: { depots: [] }, stationsDuCompte: COMPTE },
      envois: cuisine({ ...RENDUS, parade: { ...PARADE, facts: FACTS } }),
    }),
  };
}
