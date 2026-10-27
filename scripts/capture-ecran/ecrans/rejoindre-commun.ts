// Ce que les écrans de #1790 partagent (épique #1785) : « parade » cuit sur la box ; sur l'accueil, le chef a coché
// benomite/parade sur la station de son Mac. Le runtime du Mac a décidé (runtime/src/projets/rejoindre.ts) : la box en
// ligne, il rejoint sa cuisine ; la box arrêtée, il refuse en une phrase. Il l'écrit dans le suivi du gist de sa station,
// où l'app le lit (app/src/stations-du-compte.ts, `ajoutsDuSuivi`) — les deux par les fonctions mêmes du runtime et de
// l'app. Les écrans `rejoint-*` et `refuse-*` en sont tirés.
import { type Accueil, ligneDeStation } from "../../../app/src/accueil.ts";
import { calibrageRecommande, machineProposee, type VuDesProjets } from "../../../app/src/projets/projets.ts";
import { ajoutsDuSuivi } from "../../../app/src/stations-du-compte.ts";
import type { StationVue, VuDesStations } from "../../../app/src/stations/stations.ts";
import * as contrat from "../../../runtime/src/enregistrement-station/contrat.ts";
import { stationDuGist, type StationEnregistree } from "../../../runtime/src/enregistrement-station/stations-du-compte.ts";
import { documentDeSuivi } from "../../../runtime/src/projets/demande.ts";
import { issueDeLAjout, rejoindreDe } from "../../../runtime/src/projets/rejoindre.ts";
import type { Faits } from "../../../app/src/faits.ts";
import { configuration, cuisine, demarrage, type Ecran, type Etape, MAINTENANT, type Rendu } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

const INSTANT = Date.parse(MAINTENANT);
const IL_Y_A = (minutes: number) => new Date(INSTANT - minutes * 60_000).toISOString();
const DEPOT = "benomite/parade";

// Les gists de présence : la box sert parade et cantine ; le Mac, aucun.
const BOX: StationVue = { id: "box", nom: "box", machine: "Debian 12 · 8 cores", coeurs: 8, etat: "en-ligne", ligne: "", pannes: [], dit: "online", version: "2.4.0", projets: ["parade", "cantine"], max: null };
const MAC: StationVue = { id: "macbook", nom: "macbook", machine: "macOS 15 · 10 cores", coeurs: 10, etat: "en-ligne", ligne: "", pannes: [], dit: "online", version: "2.4.0", projets: [], max: null };
const STATIONS: VuDesStations = { a: MAINTENANT, stations: [BOX, MAC] };
const VU: VuDesProjets = { a: MAINTENANT, projets: [], locale: "macbook", recommandee: "box", avertissements: {}, machines: { box: machineProposee(BOX), macbook: machineProposee(MAC) }, calibrage: calibrageRecommande([]) };

// Ce que le runtime du Mac décide : la box, telle que ses gists appairés la disent, en ligne ou arrêtée.
const decide = (enLigne: boolean) => {
  const box = { id: "box", name: "box", machine: "Debian 12", kind: null, cooks: true, version: "2.4.0", online: enLigne, lastSeen: IL_Y_A(enLigne ? 1 : 25), stoppedAt: enLigne ? null : IL_Y_A(24), projects: [{ name: "parade", repository: DEPOT }] };
  const issue = issueDeLAjout({ etat: { state: "listed", stations: [box], unreadable: [] }, gists: new Map() }, DEPOT, { nom: "macbook", gist: "macbook" });
  if (issue.issue === "seule") throw new Error("le Mac se croit seul");
  return rejoindreDe(issue);
};

const enregistrement = (name: string, platform: string, machine: string) =>
  JSON.stringify({ brigade: "station-registration", format: 1, name, platform, machine, version: "2.4.0", registeredAt: "2026-10-01T08:00:00.000Z", lastSeen: IL_Y_A(1), refreshMs: 120_000, stoppedAt: null });
const selection = (repositories: string[]) => JSON.stringify({ brigade: "station-selection", format: 1, repositories, updatedAt: IL_Y_A(2) });
function lue(id: string, fichiers: Record<string, string>): StationEnregistree {
  const station = stationDuGist(id, fichiers, "benomite", INSTANT);
  if ("illisible" in station) throw new Error(station.illisible);
  return station;
}
const BOX_ENREGISTREE = lue("e3e5", { [contrat.FICHIER_ENREGISTREMENT]: enregistrement("box", "linux", "Linux 6.1.0"), [contrat.FICHIER_SELECTION]: selection([DEPOT, "benomite/cantine"]) });

// La station du Mac, enregistrée sous le compte, benomite/parade coché, et ce que son suivi en dit.
function macEnregistre(rejointe: boolean) {
  const rejoindre = decide(rejointe);
  const suivi = documentDeSuivi(
    [
      rejoindre.issue === "rejointe"
        ? { nom: "parade", etat: "secondaire", dit: `joined the kitchen that ${rejoindre.principale} runs`, autoriser: [], serviLe: null, cuitSur: rejoindre.principale, rejoindre }
        : { nom: "parade", etat: "refuse", dit: rejoindre.phrase, autoriser: [], serviLe: null, rejoindre },
    ],
    INSTANT,
    { nom: "macbook", locale: true },
  );
  const station = lue("e1c3", { [contrat.FICHIER_ENREGISTREMENT]: enregistrement("macbook", "macos", "macOS 24.1.0"), [contrat.FICHIER_SELECTION]: selection([DEPOT]) });
  return { ...station, ajouts: ajoutsDuSuivi(suivi, station.selection ?? []) };
}

// Ce que `facts` de la box rend de la cuisine de parade : sa seule station, qui cuit #14 — elle ne déclare pas encore le Mac.
const PARADE = RENDUS.parade as Rendu;
const COOK_14 = { ticket: 14, titre: "Le journal en ajout seul", station: "box/claude" };
const FACTS: Faits = { ...PARADE.facts, cooks: [COOK_14], stations: [{ station: "box/claude", distante: false, plafond: 2, ordinaires: false, bacASable: null, prendOrdinaires: true, cuisson: "cooking", arreteeDepuis: null, refus: null, cooks: [COOK_14] }] } as Faits;

const DEPOTS = { depots: [DEPOT, "benomite/cantine", "benomite/brigade"].map((depot) => ({ depot, base: "main" })) };

// L'accueil d'abord — c'est là que les stations du compte se lisent —, puis la page du Mac, ou l'onglet Cooks de parade.
const ACCUEIL: Etape = { cliquer: "#entree-tous" };
export const PAGE_DU_MAC: Etape[] = [ACCUEIL, { cliquer: '#accueil-stations button.ligne[aria-label^="macbook —"]' }];
export const COOKS_DE_PARADE: Etape[] = [ACCUEIL, { cliquer: '#projets > button[title^="parade — "]' }, { cliquer: "#onglets-du-projet button:nth-child(2)" }];

export function ecranRejoindre(dit: string, rejointe: boolean, etapes: Etape[]): Ecran {
  return {
    dit,
    largeur: 1440,
    hauteur: 900,
    etapes,
    donnees: () => {
      const accueil: Accueil = { projets: [], stations: STATIONS.stations.map((station) => ligneDeStation(station, 0, false)), sante: { ton: "vert", dit: "Max ✓  ·  GitHub ✓", survol: "" } };
      return {
        maintenant: MAINTENANT,
        reponses: { demarrage: { ...demarrage(configuration(PROJETS)), stations: STATIONS, accueil, projetsDesStations: VU }, stationsDuCompte: { state: "listed", stations: [BOX_ENREGISTREE, macEnregistre(rejointe)], unreadable: [] }, depotsDuChef: DEPOTS },
        envois: cuisine({ ...RENDUS, parade: { ...PARADE, facts: FACTS } }),
      };
    },
  };
}
