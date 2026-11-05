// L'onglet Stations de « parade », qui cuit sur ce Mac (#2489, épique #2484) : sous la liste et les réglages des
// stations, le bloc de la station de cet ordinateur — ses dossiers (le clone du projet, les worktrees de ses cooks), son
// bac à sable et ses tickets ordinaires, sa connexion à Claude, ses téléphones appairés —, chaque réglage avec son
// niveau. La box, l'autre station, n'y a rien.
import type { Bloc } from "../../../app/src/ordinaires.ts";
import type { Panne } from "../../../app/src/pannes/pannes.ts";
import type { VuDesProjets } from "../../../app/src/projets/projets.ts";
import type { StationVue, VuDesStations } from "../../../app/src/stations/stations.ts";
import type { RenduDeLaListe } from "../../../app/src/telephones-de-station.ts";
import type { Terminal } from "../../../app/src/terminaux.ts";
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "second · claude", note: "fil repris : la session d'hier", arrete: false };

const PROJETS_DES_STATIONS: VuDesProjets = { a: MAINTENANT, projets: [], locale: "macbook", recommandee: null, avertissements: {}, machines: {}, calibrage: { manager: { modele: "opus", effort: "high" }, reviewer: { modele: "opus", effort: "high" }, dit: "" } };
const EXPLICATION = "Cooks on this Mac run in Claude Code's sandbox: they write only in their own worktree, and reach only the network hosts on the project's list.";

// L'écran, selon ce que la station de ce Mac publie et ce que ses lectures rendent. La box, l'autre station, a perdu sa
// connexion : rien d'elle ne se lit dans le bloc.
export function ecranDeLaStationLocale({ dit, max, pannes, ordinaires, telephones }: { dit: string; max: StationVue["max"]; pannes: Panne[]; ordinaires: Bloc; telephones: RenduDeLaListe }): Ecran {
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
    hauteur: 900,
    etapes: [{ cliquer: '#projets > button[title^="parade"]' }, { cliquer: "#onglets-du-projet > button:nth-child(2)" }],
    donnees: () => ({
      maintenant: MAINTENANT,
      reponses: {
        demarrage: { ...demarrage(configuration(PROJETS), (nom) => nom === "parade"), poste: { nom: "this Mac", mac: true }, stations, projetsDesStations: PROJETS_DES_STATIONS },
        espace: [SECOND],
        ordinaires,
        dossiersDeLaStation: { clone: "/Users/chef/brigade-atelier/clones/parade", worktrees: "/Users/chef/brigade-atelier/worktrees/parade" },
        telephonesDeLaStation: telephones,
      },
      envois: cuisine(RENDUS),
    }),
  };
}

export const ecran = ecranDeLaStationLocale({
  dit: "L'onglet Stations de « parade », qui cuit sur ce Mac (#2489) : le bloc de la station de cet ordinateur — ses dossiers, son bac à sable, sa connexion à Claude, ses téléphones appairés",
  max: "connectee",
  pannes: [],
  ordinaires: { reglable: true, actif: true, limite: 2, explication: EXPLICATION },
  telephones: { telephones: [{ nom: "pixel-8", machine: "Android 15", appaireLe: "2026-10-02T08:12:00.000Z" }] },
});
