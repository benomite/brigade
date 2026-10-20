// Ce que les écrans du déménagement partagent (#1095) : « parade », confié par l'app à deux stations
// appairées — la box, toujours allumée, et ce Mac —, et où il cuit, tel que leurs suivis le disent.
// L'espace s'ouvre sur sa case de la barre, comme `espace-projet`.
import type { Terminal } from "../../../app/src/terminaux.ts";
import { machineProposee, calibrageRecommande, type ProjetVu, type VuDesProjets } from "../../../app/src/projets/projets.ts";
import type { StationVue, VuDesStations } from "../../../app/src/stations/stations.ts";
import { configuration, cuisine, demarrage, type Donnees, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "second · claude", note: "fil repris : la session d'hier", arrete: false };
const ECRAN_DU_SECOND = ["\x1b[1msecond · parade\x1b[0m", "", "  /brigade:second — rail lu à 10:04", "", "\x1b[2m> \x1b[0m"].join("\r\n");

const BOX: StationVue = { id: "box", nom: "box", machine: "Debian 12 · 8 cores", coeurs: 8, etat: "en-ligne", ligne: "online · 2 projects: parade, cantine", pannes: [], dit: "online", version: "", projets: ["cantine"], max: null };
const MAC: StationVue = { id: "macbook", nom: "macbook", machine: "macOS 15 · 10 cores", coeurs: 10, etat: "en-ligne", ligne: "online · no project", pannes: [], dit: "online", version: "", projets: [], max: null };
const STATIONS: VuDesStations = { a: MAINTENANT, stations: [BOX, MAC] };

const station = (id: string, nom: string, principale: boolean) => ({ id, nom, principale, etat: principale ? ("servi" as const) : ("secondaire" as const), dit: principale ? `served by ${nom}` : "not its main station: it runs neither its manager nor its pass", autoriser: [] });
// parade cuit sur la box, ou sur ce Mac : la principale, l'autre en renfort.
export const SUR_LA_BOX: ProjetVu = { nom: "parade", depot: "benomite/parade", base: "main", stations: [station("box", "box", true), station("macbook", "macbook", false)], servi: null, cuitSur: { id: "box", nom: "box", ici: false }, demenagement: null };
export const SUR_CE_MAC: ProjetVu = { ...SUR_LA_BOX, stations: [station("macbook", "macbook", true), station("box", "box", false)], cuitSur: { id: "macbook", nom: "macbook", ici: true } };

// Les données d'un écran : parade tel que `projet` le dit ; `reponses`, ce que les gestes rendent.
export function donnees(projet: ProjetVu, reponses: Record<string, unknown> = {}): Donnees {
  const envois = cuisine(RENDUS);
  const vu: VuDesProjets = { a: MAINTENANT, projets: [projet], locale: "macbook", recommandee: "box", avertissements: {}, machines: { box: machineProposee(BOX), macbook: machineProposee(MAC) }, calibrage: calibrageRecommande([]) };
  return {
    maintenant: MAINTENANT,
    reponses: { demarrage: { ...demarrage(configuration(PROJETS), (nom) => nom === "parade" && projet.cuitSur?.ici === true), stations: STATIONS, projetsDesStations: vu }, espace: [SECOND], ...reponses },
    envois: { ...envois, regarder: { ...envois.regarder, parade: [...(envois.regarder.parade ?? []), { sur: "surSortie", args: [SECOND.id, ECRAN_DU_SECOND] }] } },
  };
}

export const OUVRIR = { cliquer: '#projets > button[title^="parade — "]' };
export const DEMENAGER = { cliquer: '#stations-du-projet button[data-geste="demenager"]' };
