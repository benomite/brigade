// Une station d'un projet, vue et changée seule (épique 1506) : le chef lit
// chacune de ses stations, change le plafond et les capacités de l'une, la
// retire, ou dit que son poste la joue — et les autres restent telles
// qu'elles étaient écrites, au caractère près. Avant, il n'y avait que
// `installation stations <déclaration>`, qui remplace la déclaration entière.
//
// Deux côtés :
//   - la box, où la déclaration est une décision du chef au journal du projet
//     (`BRIGADE_STATIONS`, `decisions.ts`) : `stationsDuProjet` la lit,
//     `changerUneStation` y pose la déclaration où seule une entrée a changé.
//     `installation stations` les joue (`declarer-stations.ts`) ; la station
//     principale y tient, par `tenirUneStation`, chaque station que l'app lui
//     appaire en secondaire (`projets/secondaires.ts`) ;
//   - le poste du chef, où l'app lit dans `app.json` les stations qu'il joue
//     pour un projet (app/src/config.ts, `stations`) : `jouerIci` y ajoute une
//     station, `nePlusJouerIci` l'en retire, et l'app la joue — ou cesse — sans
//     que personne n'y touche à la main. Le reste du fichier ne change pas.
//
// Rien ici ne dépend du nom de la machine : `pc/claude` (un poste Windows) se
// lit et s'écrit comme `mac/claude`.
//
// Les refus sont en anglais : c'est l'app qui les montre.
import { readFileSync, writeFileSync } from "node:fs";
import { decisionsPosees, poserDecision } from "./decisions.ts";
import type { Evenement } from "./evenements.ts";
import type { Journal } from "./journal.ts";
import { ConfigInvalide } from "./runtime.ts";
import { ecrireStation, lireStations, NOM_DE_STATION, VARIABLE_DES_STATIONS, type StationDeclaree } from "./stations-declarees.ts";

// Une station telle que le chef la lit : son nom, son plafond de cooks, ce
// qu'elle fournit, et si elle est jouée par un poste — elle vient tirer son
// travail — ou tourne sur la box.
export type StationDuProjet = { nom: string; cooks: number; fournit: string[]; distante: boolean };

export function stationsDuProjet(declaration: string): StationDuProjet[] {
  return lireStations({ [VARIABLE_DES_STATIONS]: declaration }).map(({ nom, cooks, fournit, distante }) => ({ nom, cooks, fournit: [...fournit], distante: distante === true }));
}

// Ce qu'on change d'une station : son plafond et ses capacités ; la marquer
// jouée par un poste (`distante`, ce qu'elle prenait en plus gardé) ; ou la
// retirer.
export type Changement = { reglee: { cooks: number; fournit: string[] } } | { distante: true } | { retiree: true };

// La déclaration où seule `nom` a changé. Les autres entrées sont reprises
// telles qu'elles étaient écrites. Une station que la déclaration n'a pas, une
// valeur que le runtime ne lirait pas, ou le retrait de la dernière station
// lèvent `ConfigInvalide`.
export function changerDansLaDeclaration(declaration: string, nom: string, changement: Changement): string {
  const stations = lireStations({ [VARIABLE_DES_STATIONS]: declaration });
  // `lireStations` rend une station par entrée, dans leur ordre.
  const entrees = declaration.trim() === "" ? [] : declaration.trim().split(",").map((entree) => entree.trim());
  const rang = stations.findIndex((station) => station.nom === nom);
  const station = stations[rang];
  if (station === undefined) {
    throw new ConfigInvalide(stations.length === 0 ? `unknown station: “${nom}” — the project declares none` : `unknown station: “${nom}” — the project's stations: ${stations.map((lue) => lue.nom).join(", ")}`);
  }
  if ("retiree" in changement) {
    if (stations.length === 1) throw new ConfigInvalide(`${nom} is the project's only station: without one, no cook leaves — declare another before removing it`);
    return entrees.filter((_, place) => place !== rang).join(",");
  }
  const changee: StationDeclaree = "distante" in changement ? { ...station, distante: true } : { ...station, cooks: changement.reglee.cooks, fournit: changement.reglee.fournit };
  const neuve = entrees.map((entree, place) => (place === rang ? ecrireStation(changee) : entree)).join(",");
  // Relue : un plafond ou une capacité que le runtime ne lirait pas est refusé ici.
  lireStations({ [VARIABLE_DES_STATIONS]: neuve });
  return neuve;
}

// La déclaration où `station` est écrite telle qu'elle est donnée : ajoutée à
// la fin si la déclaration ne l'a pas, réécrite à sa place sinon. Les autres
// entrées sont reprises telles qu'elles étaient écrites, et une entrée qui dit
// déjà la même chose n'est pas réécrite. Une valeur que le runtime ne lirait
// pas lève `ConfigInvalide`.
export function tenirDansLaDeclaration(declaration: string, station: StationDeclaree): string {
  const stations = lireStations({ [VARIABLE_DES_STATIONS]: declaration });
  const entrees = declaration.trim() === "" ? [] : declaration.trim().split(",").map((entree) => entree.trim());
  const rang = stations.findIndex((lue) => lue.nom === station.nom);
  const ecrite = ecrireStation(station);
  if (rang !== -1 && ecrireStation(stations[rang]!) === ecrite) return declaration;
  const neuve = (rang === -1 ? [...entrees, ecrite] : entrees.map((entree, place) => (place === rang ? ecrite : entree))).join(",");
  lireStations({ [VARIABLE_DES_STATIONS]: neuve });
  return neuve;
}

// Tient une station au journal du projet, dans la même transaction que sa
// relecture : rend le fait écrit, ou null si elle y est déjà telle quelle.
export function tenirUneStation(journal: Journal, pose: { projet: string; station: StationDeclaree; auteur: string }): Evenement | null {
  return journal.base.transaction(() => {
    const avant = declarationDuJournal(journal);
    const neuve = tenirDansLaDeclaration(avant, pose.station);
    return neuve === avant ? null : poserDecision(journal, { projet: pose.projet, nom: VARIABLE_DES_STATIONS, valeur: neuve, auteur: pose.auteur });
  });
}

// La déclaration que le journal porte, telle qu'elle y est écrite — vide s'il
// n'en porte aucune.
export function declarationDuJournal(journal: Journal): string {
  return decisionsPosees(journal.base)[VARIABLE_DES_STATIONS] ?? "";
}

// Change une station au journal du projet : la déclaration est relue et posée
// dans la même transaction, au nom de `auteur`. Rend le fait écrit, ou null si
// rien ne change. Un refus lève `ConfigInvalide`, et rien n'est écrit.
export function changerUneStation(journal: Journal, pose: { projet: string; nom: string; changement: Changement; auteur: string }): Evenement | null {
  return journal.base.transaction(() => {
    const neuve = changerDansLaDeclaration(declarationDuJournal(journal), pose.nom, pose.changement);
    return poserDecision(journal, { projet: pose.projet, nom: VARIABLE_DES_STATIONS, valeur: neuve, auteur: pose.auteur });
  });
}

// --- Le poste du chef : `app.json`.

// Le seul moteur qu'un poste lance (app/src/config.ts, `MOTEUR`).
const MOTEUR_DU_POSTE = "claude";

export type JoueeIci = { ecrit: boolean; stations: string[] } | { refus: string };

type ProjetEcrit = Record<string, unknown> & { nom?: unknown; hote?: unknown; stations?: unknown };

// Change la liste des stations que ce poste joue pour `projet` dans le fichier
// de l'app, `chemin`. Un fichier que l'app ne lirait plus après l'écriture
// n'est pas écrit : le projet doit avoir sa box (`hote`), la station tourner
// sous `claude`.
function changerLesJouees(chemin: string, projet: string, station: string, jouer: boolean): JoueeIci {
  if (!NOM_DE_STATION.test(station)) return { refus: `“${station}” is not a station name: \`<machine>/<engine>\`, in lowercase letters, digits and dashes (mac/claude)` };
  let texte: string;
  try {
    texte = readFileSync(chemin, "utf8");
  } catch (erreur) {
    return { refus: `${chemin} could not be read: ${(erreur as Error).message}` };
  }
  let contenu: unknown;
  try {
    contenu = JSON.parse(texte);
  } catch (erreur) {
    return { refus: `${chemin} is not JSON (${(erreur as Error).message}): nothing is written` };
  }
  const projets = (contenu as { projets?: unknown } | null)?.projets;
  const ecrit = (Array.isArray(projets) ? projets : []).find((lu): lu is ProjetEcrit => typeof lu === "object" && lu !== null && (lu as ProjetEcrit).nom === projet);
  if (ecrit === undefined) return { refus: `${chemin} declares no project named “${projet}”: nothing is written` };
  if (ecrit.stations !== undefined && (!Array.isArray(ecrit.stations) || ecrit.stations.some((nom) => typeof nom !== "string"))) {
    return { refus: `“stations” of ${projet} in ${chemin} is not a list of station names: nothing is written` };
  }
  const avant = (ecrit.stations ?? []) as string[];
  if (jouer && avant.includes(station)) return { ecrit: false, stations: avant };
  if (!jouer && !avant.includes(station)) return { ecrit: false, stations: avant };
  if (jouer) {
    if (station.slice(station.indexOf("/") + 1) !== MOTEUR_DU_POSTE) return { refus: `${station} runs an engine this workstation does not run — it only runs \`${MOTEUR_DU_POSTE}\`` };
    if (typeof ecrit.hote !== "string" || ecrit.hote.trim() === "") return { refus: `${projet} has no box in ${chemin} (“hote”): a station played here pulls its work from the project's main station — nothing is written` };
  }
  const apres = jouer ? [...avant, station] : avant.filter((nom) => nom !== station);
  if (apres.length === 0) delete ecrit.stations;
  else ecrit.stations = apres;
  try {
    // La forme où l'app l'écrit (app/src/config.ts, `ecrit`).
    writeFileSync(chemin, `${JSON.stringify(contenu, null, 2)}\n`);
  } catch (erreur) {
    return { refus: `${chemin} could not be written: ${(erreur as Error).message}` };
  }
  return { ecrit: true, stations: apres };
}

// Ce poste joue `station` pour `projet` : elle est ajoutée aux `stations` du
// projet dans `app.json`, et l'app la joue à sa lecture suivante.
export function jouerIci(chemin: string, projet: string, station: string): JoueeIci {
  return changerLesJouees(chemin, projet, station, true);
}

// Ce poste ne joue plus `station` pour `projet` : elle sort de ses `stations`,
// et la liste avec elle si elle était la dernière.
export function nePlusJouerIci(chemin: string, projet: string, station: string): JoueeIci {
  return changerLesJouees(chemin, projet, station, false);
}
