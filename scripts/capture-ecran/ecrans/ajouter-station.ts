// Un projet monté avant l'app (#1288) : sa box le sert déjà, l'app n'a rien gardé de lui. « + station » cliqué, et
// rien d'autre (#1307) : « Add a station », ce Mac choisi d'office, et ce qui est à lui seul, posé dès le premier
// rendu — ses cooks, le dossier des espaces de travail de sa station, ses capacités, les détectées cochées. Ni dépôt
// ni branche : la première station les sert, ou le clone du projet les dit.
import type { DefautsDeLaMachine } from "../../../app/src/projets/projets.ts";
import type { Ecran } from "./commun.ts";
import { donnees, OUVRIR, SUR_LA_BOX } from "./cuisine-demenagee.ts";

export const AJOUTER = { cliquer: "#stations-du-projet button.ajout-de-station:not([hidden])" };

// Ce que l'opération du runtime calcule pour ce Mac (#1306) : 10 cœurs, son dossier, ce qu'il a.
export const DEFAUTS: DefautsDeLaMachine = {
  cooks: 4,
  cooksDit: "from this machine's 10 cores: two are kept for the kitchen itself, then about two per cook",
  espaceDeTravail: "/Users/chef/.local/state/brigade/worktrees",
  capacites: [
    { capacite: "postgres", nom: "a Postgres database", detectee: false },
    { capacite: "docker", nom: "Docker", detectee: true },
    { capacite: "navigateur-headless", nom: "a browser", detectee: true },
    { capacite: "android", nom: "the Android SDK", detectee: false },
  ],
};

// parade n'est pas dans le fichier des projets de l'app côté stations : la box le sert, c'est tout.
export function avantLApp(reponses: Record<string, unknown> = {}) {
  const tout = donnees(SUR_LA_BOX, { depotsDuChef: { depots: [{ depot: "benomite/parade", base: "main" }] }, defautsDeStation: DEFAUTS, ...reponses });
  const lu = tout.reponses.demarrage as { stations: { stations: { id: string; projets: string[] }[] }; projetsDesStations: { projets: unknown[] } };
  lu.projetsDesStations.projets = [];
  for (const station of lu.stations.stations) if (station.id === "box") station.projets = ["cantine", "parade"];
  return tout;
}

export const ecran: Ecran = {
  dit: "L'espace d'un projet d'avant l'app, servi par sa box : « + station » cliqué, rien d'autre — ce Mac choisi, ses cooks, son dossier et ses capacités posés d'emblée, ni dépôt ni branche (#1288, #1307)",
  largeur: 1440,
  hauteur: 900,
  etapes: [OUVRIR, AJOUTER],
  donnees: () => avantLApp(),
};
