// « Add a project », un projet ajouté par son dossier (#2477) : le parcours d'ajout reste à l'écran et demande qui le cuit
// — ce Mac d'abord, puis les stations appairées du compte. Le dossier choisi est le clone de `chef/cantine` ; l'ajout
// l'écrit (`ajouter`), et les stations du compte se relisent pour s'y proposer.
import * as contrat from "../../../runtime/src/enregistrement-station/contrat.ts";
import { stationDuGist, type StationEnregistree, type StationsDuCompte } from "../../../runtime/src/enregistrement-station/stations-du-compte.ts";
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";
import { COMPTE } from "./premier-lancement-commun.ts";

const INSTANT = Date.parse(MAINTENANT);
const IL_Y_A = (minutes: number) => new Date(INSTANT - minutes * 60_000).toISOString();

function lue(id: string, name: string, machine: string, vu: number, repositories: string[]): StationEnregistree {
  const station = stationDuGist(
    id,
    {
      [contrat.FICHIER_ENREGISTREMENT]: JSON.stringify({ brigade: "station-registration", format: 1, name, platform: "linux", machine, version: "2.4.0", registeredAt: "2026-10-01T08:00:00.000Z", lastSeen: IL_Y_A(vu), refreshMs: 120_000, stoppedAt: null }),
      [contrat.FICHIER_SELECTION]: JSON.stringify({ brigade: "station-selection", format: 1, repositories, updatedAt: IL_Y_A(60) }),
    },
    "chef",
    INSTANT,
  );
  if ("illisible" in station) throw new Error(station.illisible);
  return station;
}
// Deux stations appairées : parade-box, en ligne, et atelier, éteinte depuis deux jours.
export const APPAIREES: StationsDuCompte = { state: "listed", stations: [lue("a1b2c3", "parade-box", "Linux 6.1.0", 1, ["chef/parade"]), lue("f7e8d9", "atelier", "Linux 6.8.0", 2 * 24 * 60, [])], unreadable: [] };
export const AUCUNE: StationsDuCompte = { state: "listed", stations: [], unreadable: [] };

export function ajoutStation(dit: string, stations: StationsDuCompte): Ecran {
  return {
    dit,
    largeur: 1440,
    hauteur: 900,
    etapes: [{ cliquer: "#entree-ajout" }, { cliquer: "#dossier" }, { cliquer: "#ajouter" }],
    donnees: () => ({
      maintenant: MAINTENANT,
      reponses: {
        demarrage: demarrage(configuration(PROJETS)),
        compteGitHub: COMPTE,
        choisirDossier: "/Users/chef/code/cantine",
        lireClone: { depot: "chef/cantine", base: "main", raisons: {} },
        ajouter: { etat: "ajoute", nom: "cantine-2" },
        stationsDuCompte: stations,
        projetsServis: { depots: [] },
      },
      envois: cuisine(RENDUS),
    }),
  };
}
