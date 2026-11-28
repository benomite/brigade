// @ts-check
// Les stations enregistrées sous le compte GitHub du chef (ticket 1706, épique 1702), dans la liste des stations de
// l'accueil : une machine s'y lit une fois (ticket 1778, épique 1777). Une machine appairée s'y dit par sa présence
// (home.ts), à laquelle son enregistrement ajoute les projets choisis pour elle (`ligneFondue`) : il ne pose ni seconde
// ligne, ni section à part — il n'est que la façon dont la machine est arrivée (`uneLigneParMachine`), et ce qui lui est
// choisi ; ses cases s'ouvrent d'un bouton à côté de sa ligne. Une machine seulement enregistrée a sa ligne d'après son
// enregistrement — sa pastille, son nom, en ligne ou non, les projets qu'elle sert — ; un clic l'ouvre sur les projets
// du chef, à cocher : ceux qu'elle doit servir (ticket 1780). Ce sont les projets que la brigade connaît déjà — ceux de
// l'app, ceux que ses stations servent ou qui leur sont choisis — parmi les dépôts que le compte atteint ; tout autre dépôt
// ne s'ajoute que par le champ de recherche, qui ne montre que ceux dont le nom contient ce qui est tapé — jamais la liste
// entière. Ajouté, il est choisi pour la station, et rejoint les projets du chef. Une case cochée ou décochée s'écrit aussitôt dans le gist de la station
// (stations-of-account.ts) ; relue au lancement
// suivant, la sélection est celle qui a été écrite. Une station hors ligne se dit telle, et ses cases restent à cocher :
// elle sert ce qui est choisi à son retour.
// Sous la liste, ce que la lecture du compte a de plus à dire (`lectureDuCompte`) : sans aucune station, la commande
// d'installation, que copie un bouton ; une connexion à GitHub qui manque, le bouton du premier lancement
// (addition-project/connection.js) ; une lecture qui échoue, une ligne, son détail au survol.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (bricks.js), et rend des éléments.

import { NOT_STILL } from "./lexicon.js";

/** @typedef {import("./bricks.js").Fabrique} Fabrique */
/** @typedef {import("../stations-of-account.ts").StationsOfAccount} StationsOfAccount */
/** @typedef {import("../stations-of-account.ts").StationRecorded} StationRecorded */
/** @typedef {import("../projects/github.ts").RepositoryOfChef} RepositoryOfChef */
/** @typedef {import("./addition-project/connection.js").Connection} Connection */

// Ce que la vue tient du bloc. `stations` : absentes, leur lecture est en route. `envoi` : la station dont la sélection
// s'écrit. `refus` : pourquoi la dernière écriture n'a pas eu lieu. `copiee` : la commande d'installation que le bouton vient
// de copier. `connexion` : la connexion à GitHub lancée. `attendus` : les dépôts que le chef vient de choisir pour une
// station, dont elle n'a pas encore dit ce qu'elle fait (ticket 1790).
/**
 * @typedef {{
 *   stations?: StationsOfAccount,
 *   envoi?: string,
 *   refus?: { id: string, refus: string, detail?: string },
 *   copiee?: string,
 *   connexion?: Connection,
 *   attendus?: { id: string, depots: readonly string[] },
 * }} StateOfAccount
 */
/**
 * @typedef {{
 *   ouvrirLaStation: (id: string) => void,
 *   relire: () => void,
 *   seConnecter: () => void,
 *   ouvrirLaPage: (url: string) => void,
 *   copier: (command: string) => void,
 * }} ActionsOfAccount
 */

export const NO = `${NOT_STILL("station")} Install one on the machine that will cook.`;
export const UNREADABLE = "your stations could not be read";
export const REREAD = "read again";
export const COPY = "copy";
export const COPIED = "copied";
// Les mots de l'état d'une machine, ceux de sa ligne quand elle est appairée (stations/stations.ts, `etatDe`).
export const IN_LINE = "online";
export const OUTSIDE_LINE = "offline";
// Une station que la limite de GitHub retient (ticket 2443) : elle est là, ses appels attendent la fin de la limite — son
// signe de vie ne bouge plus d'ici là. Ni « online », ni « offline » : elle garde ses projets. L'heure est celle du chef.
/** @param {string} until */
export const HELD = (until) => {
  const d = new Date(until);
  return `held by GitHub's limit until ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

// L'état d'une station du compte, en mots : retenue par la limite de GitHub, en ligne, ou hors ligne.
/** @param {Pick<StationRecorded, "available" | "heldUntil">} station */
export const stateSays = (station) => (station.heldUntil ? HELD(station.heldUntil) : station.available ? IN_LINE : OUTSIDE_LINE);

// Ce qu'une station a fait d'un dépôt choisi pour elle, tel que son gist le dit (stations-of-account.ts, `ajouts`) — rien tant
// qu'elle ne l'a pas lu.
/** @param {StationRecorded | undefined} station @param {string} repository */
export function issueOfTheAddition(station, repository) {
  return (station?.ajouts ?? []).find((addition) => addition.depot.toLowerCase() === repository.toLowerCase());
}

// Ce que les stations du compte ont fait d'un projet qui leur a été choisi alors qu'une autre le servait déjà (ticket
// 1790) : celles qui ont rejoint sa cuisine, avec la station qui la fait tourner ; celles qui refusent, avec leur phrase.
// Le projet se reconnaît à son dépôt ; sans dépôt connu, au nom que la station tire du dépôt choisi. Un dépôt décoché
// depuis n'en dit plus rien.
/** @param {StationsOfAccount | undefined} readEntries @param {{ nom: string, depot: string }} projet */
export function additionsOfProject(readEntries, { nom: name, depot: repository }) {
  /** @type {{ station: StationRecorded, principale: string }[]} */
  const joined = [];
  /** @type {{ station: StationRecorded, phrase: string }[]} */
  const refused = [];
  if (readEntries?.state !== "listed") return { rejointes: joined, refusees: refused };
  const isTheItsOwn = (/** @type {string} */ chosen) => (repository === "" ? (chosen.split("/")[1] ?? "").toLowerCase() === name : chosen.toLowerCase() === repository.toLowerCase());
  for (const station of readEntries.stations) {
    for (const chosen of (station.selection ?? []).filter(isTheItsOwn)) {
      const issue = issueOfTheAddition(station, chosen);
      if (issue?.issue === "rejointe") joined.push({ station, principale: issue.principale });
      if (issue?.issue === "refusee") refused.push({ station, phrase: issue.phrase });
    }
  }
  return { rejointes: joined, refusees: refused };
}

// La commande d'installation d'une station, selon le système de la machine qui cuit (docs/installation-station.md).
/** @type {readonly { systeme: string, commande: string }[]} */
export const INSTALLER = [
  { systeme: "Linux or macOS", commande: "curl -fsSL https://github.com/benomite/brigade/releases/download/station/installer-station.sh | sh" },
  { systeme: "Windows, in PowerShell", commande: "irm https://github.com/benomite/brigade/releases/download/station/installer-station.ps1 | iex" },
];

// La plateforme telle que le contrat la publie, dite comme on la nomme.
/** @type {Readonly<Record<string, string>>} */
const PLATFORMS = { linux: "Linux", macos: "macOS", windows: "Windows" };
/** @param {string} platform */
export const platformSaid = (platform) => PLATFORMS[platform] ?? platform;



// Le nom d'un dépôt choisi tel qu'une station nomme le projet qu'elle en fait : celui du dépôt, en minuscules.
/** @param {string} repository */
const nameOfChosen = (repository) => (repository.split("/").pop() ?? repository).toLowerCase();

// Les projets qu'une machine appairée et enregistrée sert, calculés en un seul endroit : ceux de sa présence — la
// configuration qu'elle fait tourner —, puis ceux qui lui sont choisis dans son enregistrement et que sa présence ne nomme
// pas encore (elle les prend en main dans les 30 s). Rien de choisi, ou rien encore : ceux de sa présence.
/** @param {readonly string[]} projects @param {readonly string[] | null} selection */
export function projectsServed(projects, selection) {
  const heldOnes = new Set(projects.map((project) => project.toLowerCase()));
  return [...projects, ...(selection ?? []).filter((repository) => !heldOnes.has(nameOfChosen(repository)))];
}




// Le dernier signe de vie d'une station, à la minute, en temps universel.
/** @param {string} instant */
const vueSays = (instant) => `last sign of life ${instant.slice(0, 16).replace("T", " ")} UTC`;

// Ce que la plateforme, la machine, la version et le dernier signe de vie d'une station disent d'elle, au survol.
/** @param {StationRecorded} station */
export const detailsOf = (station) => [platformSaid(station.platform), station.machine, `version ${station.version}`, vueSays(station.lastSeen)].filter((piece) => piece !== "").join(" · ");




