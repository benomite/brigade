// L'onglet Stations de « parade », qui cuit sur ce Mac (#2489, épique #2484) : sous la liste et les réglages des
// stations, le bloc de la station de cet ordinateur — ses dossiers (le clone du projet, les worktrees de ses cooks), son
// bac à sable et ses tickets ordinaires, sa connexion à Claude —, chaque réglage avec son niveau. Plus de téléphones
// appairés (#2500). La box, l'autre station, n'y a rien.
import type { Faits } from "../../../app/src/faits.ts";
import type { Bloc, StationDesFaits } from "../../../app/src/ordinaires.ts";
import type { Panne } from "../../../app/src/pannes/pannes.ts";
import type { VuDesProjets } from "../../../app/src/projets/projets.ts";
import type { StationsLues } from "../../../app/src/service.ts";
import type { StationVue, VuDesStations } from "../../../app/src/stations/stations.ts";
import type { Terminal } from "../../../app/src/terminaux.ts";
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT, type Rendu } from "./commun.ts";
import { guide } from "./cooks-stations-commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "second · claude", note: "fil repris : la session d'hier", arrete: false };

const PROJETS_DES_STATIONS: VuDesProjets = { a: MAINTENANT, projets: [], locale: "macbook", recommandee: null, avertissements: {}, machines: {}, calibrage: { manager: { modele: "opus", effort: "high" }, reviewer: { modele: "opus", effort: "high" }, dit: "" } };
// Au-dessus, la liste et les réglages des stations (#2487, #2488) : « parade » n'en déclare qu'une, celle de ce Mac.
const DECLAREES: StationsLues = { proposees: [], absent: null, declarees: [{ nom: "mac/claude", moteur: "claude", fournit: ["code", "macos"], cooks: 2, distante: false }] };
const FAITS_DES_STATIONS: StationDesFaits[] = [{ station: "mac/claude", distante: false, plafond: null, ordinaires: true, bacASable: null, prendOrdinaires: true, cuisson: "cooking", cooks: [] }];
const RENDU = RENDUS.parade as Rendu;
const EXPLICATION = "Cooks on this Mac run in Claude Code's sandbox: they write only in their own worktree, and reach only the network hosts on the project's list.";

// L'écran, selon ce que la station de ce Mac publie et ce que ses lectures rendent. La box, l'autre station, a perdu sa
// connexion : rien d'elle ne se lit dans le bloc.
export function ecranDeLaStationLocale({ dit, max, pannes, ordinaires }: { dit: string; max: StationVue["max"]; pannes: Panne[]; ordinaires: Bloc }): Ecran {
  const stations: VuDesStations = {
    a: MAINTENANT,
    stations: [
      { id: "macbook", nom: "macbook", machine: "macOS 15 · 10 cores", etat: "en-ligne", ligne: "online · 1 project: parade", pannes, dit: "online", version: "", projets: ["parade"], max },
      { id: "box", nom: "box", machine: "Debian 12 · 8 cores", etat: "en-ligne", ligne: "online · 1 project: cantine", pannes: [], dit: "online", version: "", projets: ["cantine"], max: "perdue" },
    ],
  };
  return {
    dit,
    largeur: 1440,
    hauteur: 1300,
    etapes: [{ cliquer: '#projets > button[title^="parade"]' }, { cliquer: "#onglets-du-projet > button:nth-child(2)" }],
    donnees: () => ({
      maintenant: MAINTENANT,
      reponses: {
        demarrage: { ...demarrage(configuration(PROJETS), (nom) => nom === "parade"), poste: { nom: "this Mac", mac: true }, stations, projetsDesStations: PROJETS_DES_STATIONS },
        espace: [SECOND],
        service: guide(DECLAREES),
        ordinaires,
        dossiersDeLaStation: { clone: "/Users/chef/brigade-atelier/clones/parade", worktrees: "/Users/chef/brigade-atelier/worktrees/parade" },
      },
      envois: cuisine({ ...RENDUS, parade: { ...RENDU, facts: { ...RENDU.facts, stations: FAITS_DES_STATIONS } as Faits } }),
    }),
  };
}

export const ecran = ecranDeLaStationLocale({
  dit: "L'onglet Stations de « parade », qui cuit sur ce Mac (#2489) : le bloc de la station de cet ordinateur — ses dossiers, son bac à sable, sa connexion à Claude",
  max: "connectee",
  pannes: [],
  ordinaires: { reglable: true, actif: true, limite: 2, explication: EXPLICATION },
});
