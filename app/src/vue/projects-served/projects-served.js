// @ts-check
// Les projets que la station de cet ordinateur sert (ticket 2359, épique 2356), sous cette machine — un bloc que Settings
// ne montre plus depuis le ticket 2494 : il attend, caché, avec ce qui était sous « This machine ». La
// station n'en a qu'une liste, sa configuration (ticket 3402) ; l'écran
// la lit par le process principal, sans la changer : un projet s'ajoute ou se retire de cette liste sur son onglet
// Stations (project/stations/).
//
// Une ligne d'en-tête dit ce que sert cet ordinateur — et, à l'installation, qu'il n'en sert aucun : la liste est vide,
// et la station ne prend aucun ticket. Puis une ligne par projet de l'app : son nom, son dépôt, `served` ou
// `not served` — chaque ligne est la rangée de réglage de l'app (components/setting, ticket 2920), sans contrôle. Un
// projet dont l'app ne connaît pas le dépôt le dit au survol. Un dépôt de la liste qu'aucun projet de l'app ne porte
// garde sa ligne, `served` : le chef voit tout ce qui cuit ici.
//
// `tenirLesProjetsServis` garde l'état de l'écran ; `poserLesProjetsServis` le dessine. Ni l'un ni l'autre ne touche
// `document` : la vue leur donne une fabrique (bricks.js).

import { hover } from "../bricks.js";
import { lineError } from "../components/line-error/line-error.js";
import { rowOfSetting } from "../components/setting/setting.js";
import { lineEmpty } from "../components/line-empty/line-empty.js";
import { THIS_COMPUTER, NOT_REACHED, READING } from "../lexicon.js";

/** @typedef {import("../bricks.js").Fabrique} Fabrique */
/** @typedef {{ depots: string[] } | { refus: string }} ReadOfProjectsServed */
/**
 * Ce que l'écran demande au process principal. Absents, ou `projetsServis` qui ne rend rien : cet appareil n'a pas de
 * station (un téléphone), et rien ne se pose. `servirUnProjet` : l'écriture de la liste, que l'onglet Stations d'un projet
 * fait (ticket 3402) — cet écran ne l'appelle pas.
 * @typedef {{
 *   projetsServis?(): Promise<ReadOfProjectsServed | undefined>,
 *   servirUnProjet?(repository: string, served: boolean): Promise<ReadOfProjectsServed>,
 * }} BridgeOfProjectsServed
 */
/** Un projet de l'app : son nom, et son dépôt GitHub s'il est connu. @typedef {{ nom: string, depot?: string }} ProjectOfTheApp */
/** @typedef {{ lecture?: ReadOfProjectsServed }} StateOfProjectsServed */

// Les mots de l'écran. `ici` : le nom que l'écran donne à cet ordinateur (« this Mac », « this PC »).
export const TITLE = (/** @type {string} */ here) => `projects ${here} serves`;
export const NO = (/** @type {string} */ here) => `${here} serves no project`;
export const SERVES = (/** @type {number} */ howMany) => (howMany === 1 ? "serves 1 project" : `serves ${howMany} projects`);
export const HELP = (/** @type {string} */ here) =>
  `${here}'s station cooks only the projects on this list, straight from GitHub: it clones each one on ${THIS_COMPUTER} and takes its tickets. With none, it takes no ticket. A project is added or removed on its Stations tab.`;
export const SERVED = "served";
export const NOT_SERVED = "not served";
export const WITHOUT_REPOSITORY = "The app does not know this project's GitHub repository: add it again from its repository to serve it here.";
export const OUTSIDE_OF_THE_APP = "Not one of this app's projects: the station serves it because it is on its list. It changes from its Stations tab once it is one of the app's projects.";
export const UNREADABLE = NOT_REACHED("projects served here");

// Un dépôt se compare sans égard à la casse, comme la station le fait (projets-servis.ts).
const key = (/** @type {string} */ repository) => repository.toLowerCase();

// Un refus de la station en une ligne : sa première proposition ; ce qui suit son tiret, au survol.
/** @param {string} refusal */
export function refusalSays(refusal) {
  const [line = refusal, ...suite] = refusal.split(" — ");
  return { ligne: `nothing was written: ${line.replace(/^brigade: /, "")}`, detail: suite.join(" — ") };
}

// L'état de l'écran. `rendre` : l'état a changé, l'écran se redessine.
/** @param {{ pont: BridgeOfProjectsServed, rendre: () => void }} options */
export function holdTheProjectsServed({ pont: bridge, rendre: render }) {
  /** @type {StateOfProjectsServed | undefined} */
  let state;
  let tour = 0;

  // La liste que la station tient. Une lecture qui ne rend rien : pas de station ici, l'écran se retire.
  async function read() {
    const itsOwn = ++tour;
    if (typeof bridge.projetsServis !== "function") {
      state = undefined;
      return render();
    }
    /** @type {ReadOfProjectsServed | undefined} */
    const readEntry = await bridge.projetsServis().catch((error) => ({ refus: error instanceof Error ? error.message : String(error) }));
    if (itsOwn !== tour) return;
    if (readEntry === undefined) state = undefined;
    else {
      state ??= {};
      state.lecture = readEntry;
    }
    render();
  }

  return {
    /** @returns {StateOfProjectsServed | undefined} */
    get etat() {
      return state;
    },
    lire: read,
  };
}

// Les lignes de l'écran : une par projet de l'app, dans l'ordre de l'app, puis une par dépôt de la liste qu'aucun
// projet ne porte.
/** @param {readonly ProjectOfTheApp[]} projects @param {readonly string[]} repositories */
export function linesOfProjects(projects, repositories) {
  const servedOnes = new Set(repositories.map(key));
  const knownOnes = new Set();
  /** @type {{ nom: string, depot: string | null, servi: boolean, horsDeLApp: boolean }[]} */
  const lines = [];
  for (const project of projects) {
    const repository = project.depot?.trim() || null;
    if (repository !== null) knownOnes.add(key(repository));
    lines.push({ nom: project.nom, depot: repository, servi: repository !== null && servedOnes.has(key(repository)), horsDeLApp: false });
  }
  for (const repository of repositories) if (!knownOnes.has(key(repository))) lines.push({ nom: repository, depot: repository, servi: true, horsDeLApp: true });
  return lines;
}

// Chaque classe est posée en clair, `className = "…"` : la peau ne vise que des classes que la vue pose, et son test
// les lit ainsi (skin.test.ts).
/** @param {Fabrique} doc @param {string} balise @param {string} [text] */
function created(doc, balise, text) {
  const element = doc.createElement(balise);
  if (text !== undefined) element.textContent = text;
  return element;
}

// L'écran : la ligne d'en-tête — ce que sert cet ordinateur, ou qu'il n'en sert aucun —, puis une ligne par projet.
/** @param {Fabrique} doc @param {{ etat: StateOfProjectsServed, projets: readonly ProjectOfTheApp[], ici: string }} quoi */
export function setTheProjectsServed(doc, { etat: state, projets: projects, ici: here }) {
  const root = created(doc, "div");
  root.className = "projets-servis";
  root.ariaLive = "polite";
  const readEntry = state.lecture;
  const repositories = readEntry !== undefined && "depots" in readEntry ? readEntry.depots : undefined;

  /** @type {any[]} */
  let value;
  if (readEntry === undefined) value = [created(doc, "span", READING)];
  else if (repositories === undefined) value = [lineError(doc, UNREADABLE, "refus" in readEntry ? readEntry.refus : "")];
  else if (repositories.length === 0) {
    const no = lineEmpty(doc, NO(here), { classe: "aucun", balise: "strong" });
    value = [no, hover(doc, HELP(here))];
  } else value = [created(doc, "span", SERVES(repositories.length)), hover(doc, HELP(here))];
  const head = rowOfSetting(doc, { nom: TITLE(here), valeur: value, classe: "tete" });
  root.append(head);
  if (repositories === undefined) return root;

  for (const line of linesOfProjects(projects, repositories)) {
    // Le dépôt d'un projet de l'app se lit à côté de son nom ; un dépôt hors de l'app est son nom.
    /** @type {any} */
    let repositorySays;
    if (!line.horsDeLApp && line.depot !== null) {
      repositorySays = created(doc, "small", line.depot);
      repositorySays.className = "mono depot";
    }
    /** @type {any[]} */
    const isWorth = [];
    if (line.depot === null) isWorth.push(created(doc, "span", "–"), hover(doc, WITHOUT_REPOSITORY));
    else {
      const word = created(doc, line.servi ? "strong" : "span", line.servi ? SERVED : NOT_SERVED);
      if (line.servi) word.className = "servi";
      else word.className = "pas-servi";
      isWorth.push(word);
      if (line.horsDeLApp) isWorth.push(hover(doc, OUTSIDE_OF_THE_APP));
    }
    const rank = rowOfSetting(doc, { nom: line.nom, valeur: isWorth });
    if (repositorySays !== undefined) rank.children[0].append(repositorySays);
    if (line.horsDeLApp) rank.children[0].className = "nom mono";
    rank.dataset.projet = line.nom;
    root.append(rank);
  }
  return root;
}
