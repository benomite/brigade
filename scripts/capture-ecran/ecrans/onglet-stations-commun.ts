// L'onglet Stations de « parade » (#2487) : ses deux stations — la box cuit #14, le Mac, distant, arrêté par le chef y
// finit #15 —, puis « Add a station ». Le Mac de l'écran a sa station, qui ne sert pas encore parade (`projetsServis`) ;
// le compte du chef a deux stations appairées : parade-box, à qui parade est choisi, et atelier, à qui rien ne l'est.
import type { Faits } from "../../../app/src/faits.ts";
import * as contrat from "../../../runtime/src/enregistrement-station/contrat.ts";
import { stationDuGist, type StationEnregistree, type StationsDuCompte } from "../../../runtime/src/enregistrement-station/stations-du-compte.ts";
import { configuration, cuisine, demarrage, type Ecran, type Etape, MAINTENANT, type Rendu } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

const INSTANT = Date.parse(MAINTENANT);
const IL_Y_A = (minutes: number) => new Date(INSTANT - minutes * 60_000).toISOString();
const PARADE = RENDUS.parade as Rendu;
// La box cuit #14, le Mac, distant, arrêté par le chef y finit #15.
const issue = (ticket: number) => `https://github.com/chef/parade/issues/${ticket}`;
const COOK_14 = { ticket: 14, titre: "Le journal en ajout seul", station: "box/claude" };
const COOK_15 = { ticket: 15, titre: "La carte des desserts", station: "mac/claude" };
const station = { plafond: 2, ordinaires: false, bacASable: null, prendOrdinaires: true, arreteeDepuis: null, refus: null } as const;
const FACTS: Faits = {
  ...PARADE.facts,
  compteurs: { ...PARADE.facts.compteurs, auTravail: 2 },
  rail: [
    ...PARADE.facts.rail.slice(0, 1),
    { ticket: 15, etat: "pris", titre: COOK_15.titre, url: issue(15), activite: null, attente: null },
    ...PARADE.facts.rail.slice(1),
  ],
  cooks: [COOK_14, COOK_15],
  stations: [
    { ...station, station: "box/claude", distante: false, cuisson: "cooking", cooks: [COOK_14] },
    { ...station, station: "mac/claude", distante: true, cuisson: "stopped", arreteeDepuis: "2026-10-13T09:52:00.000Z", cooks: [COOK_15] },
  ],
} as Faits;

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

export function ongletStations(dit: string, etapes: Etape[] = [], quotaGithub?: unknown): Ecran {
  return {
    dit,
    largeur: 1440,
    hauteur: 1000,
    etapes: [{ cliquer: '#projets > button[title^="parade — "]' }, { cliquer: "#onglets-du-projet button:nth-child(2)" }, ...etapes],
    donnees: () => ({
      maintenant: MAINTENANT,
      reponses: { demarrage: demarrage(configuration([{ ...PROJETS[0]!, depot: "chef/parade" }, PROJETS[1]!])), espace: [], projetsServis: { depots: [] }, stationsDuCompte: COMPTE },
      envois: cuisine({ ...RENDUS, parade: { ...PARADE, facts: quotaGithub === undefined ? FACTS : ({ ...FACTS, quotaGithub } as Faits) } }),
    }),
  };
}
