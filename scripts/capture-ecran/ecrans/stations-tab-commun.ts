// L'onglet Stations de « parade » dans chacun des quatre états de sa ligne du haut (#3195) : parade, confié par l'app à sa
// box, et ce Mac, appairé, qui ne le sert pas. Ce qui change d'un écran à l'autre : ce que la box et ce Mac disent servir,
// en ligne ou non, le déménagement que leurs suivis publient, et ce que `facts` dit de la cuisson.
import type { Facts } from "../../../app/src/facts.ts";
import { calibrationRecommended, machineProposed, type MoveInProgress, type ProjectSeen, type SeenOfProjects } from "../../../app/src/projects/projects.ts";
import type { StationVue, SeenOfStations } from "../../../app/src/stations/stations.ts";
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT, type Rendu } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

const INSTANT = Date.parse(MAINTENANT);
const IL_Y_A = (minutes: number) => new Date(INSTANT - minutes * 60_000).toISOString();
const PARADE = RENDUS.parade as Rendu;

export const BOX: StationVue = { id: "gbox", nom: "parade-box", machine: "Debian 12 · 8 cores", coeurs: 8, etat: "en-ligne", ligne: "online · 1 project: parade", pannes: [], dit: "online", version: "2.4.0", projets: ["parade"], max: "connectee" };
export const MAC: StationVue = { id: "gmac", nom: "macbook", machine: "macOS 15 · 10 cores", coeurs: 10, etat: "en-ligne", ligne: "online · no project", pannes: [], dit: "online", version: "2.4.0", projets: [], max: "connectee" };
const station = (id: string, nom: string) => ({ id, nom, etat: "servi" as const, dit: `served by ${nom}`, autoriser: [] });
export const CONFIE: ProjectSeen = { nom: "parade", depot: "chef/parade", base: "main", suiviPar: { id: "gbox", nom: "parade-box" }, stations: [station("gbox", "parade-box")], servi: null, cuitSur: { id: "gbox", nom: "parade-box", ici: false }, demenagement: null };
// Le déménagement vers ce Mac, demandé il y a trois minutes et resté sans réponse.
export const VERS_CE_MAC: MoveInProgress = { de: "parade-box", vers: "macbook", demandeLe: IL_Y_A(3), etape: "demandee", dit: "" };

// La box cuit #14 : sa ligne de cuisson, au nom de ses prises.
const COOK_14 = { ticket: 14, titre: "Le journal en ajout seul", station: "parade-box/claude" };
const ligne = { station: "parade-box/claude", distante: false, plafond: 2, ordinaires: false, bacASable: null, prendOrdinaires: true, cuisson: "cooking", arreteeDepuis: null, refus: null, presente: true, cooks: [COOK_14] };
const faits = (cuit: boolean): Facts => ({ ...PARADE.facts, cooks: cuit ? [COOK_14] : [], stations: cuit ? [ligne] : [] }) as unknown as Facts;

// `servisIci` : la liste de la station de ce Mac, lue sur son disque (#3402) — vide par défaut ; `ici` : sa cuisine tourne sur
// ce Mac (workstation/kitchen-here.ts) ; `facts` : ce que `facts` dit de la cuisson, à la place de ce que `cuit` en dit ; `rendus` :
// ce que la box rend des projets, à la place de la cuisine figée — « parade » éteint (#3454).
export function ongletDesStations(dit: string, { stations, projet, cuit = false, ici = false, servisIci = [], facts, rendus = RENDUS }: { stations: StationVue[]; projet: ProjectSeen; cuit?: boolean; ici?: boolean; servisIci?: string[]; facts?: Facts; rendus?: Record<string, Rendu> }): Ecran {
  const vu: SeenOfProjects = { a: MAINTENANT, projets: [projet], locale: "gmac", recommandee: "gbox", avertissements: {}, machines: { gbox: machineProposed(BOX), gmac: machineProposed(MAC) }, calibrage: calibrationRecommended([]) };
  return {
    dit,
    largeur: 1440,
    hauteur: 900,
    etapes: [{ cliquer: '#projets > button[title^="parade — "]' }, { cliquer: "#onglets-du-projet button:nth-child(2)" }],
    donnees: () => ({
      maintenant: MAINTENANT,
      reponses: {
        demarrage: { ...demarrage(configuration([{ ...PROJETS[0]!, depot: "chef/parade" }, PROJETS[1]!]), (nom) => ici && nom === "parade"), stations: { a: MAINTENANT, stations } satisfies SeenOfStations, projetsDesStations: vu },
        espace: [],
        projetsServis: { depots: servisIci },
        stationsDuCompte: { state: "listed", stations: [], unreadable: [] },
      },
      envois: cuisine({ ...rendus, parade: { ...(rendus.parade ?? PARADE), facts: facts ?? faits(cuit) } }),
    }),
  };
}
