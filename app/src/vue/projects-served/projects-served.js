// @ts-check
// Les projets que la station de cet ordinateur sert (ticket 2359, épique 2356), sous cette machine — un bloc que Settings
// ne montre plus depuis le ticket 2494 : il attend, caché, avec ce qui était sous « This machine ». La
// station n'en a qu'une liste, sa configuration (runtime/src/station-ordinateur/projets-servis.ts, ticket 3402) ; l'écran
// la lit par le process principal, sans la changer : un projet s'ajoute ou se retire de cette liste sur son onglet
// Stations (project/stations/).
//
// Une ligne d'en-tête dit ce que sert cet ordinateur — et, à l'installation, qu'il n'en sert aucun : la liste est vide,
// et la station ne prend aucun ticket. Puis une ligne par projet de l'app : son nom, son dépôt, `served` ou
// `not served` — chaque ligne est la rangée de réglage de l'app (composants/setting, ticket 2920), sans contrôle. Un
// projet dont l'app ne connaît pas le dépôt le dit au survol. Un dépôt de la liste qu'aucun projet de l'app ne porte
// garde sa ligne, `served` : le chef voit tout ce qui cuit ici.
//
// `tenirLesProjetsServis` garde l'état de l'écran ; `poserLesProjetsServis` le dessine. Ni l'un ni l'autre ne touche
// `document` : la vue leur donne une fabrique (briques.js).

import { survol } from "../briques.js";
import { lineError } from "../composants/line-error/line-error.js";
import { rangeeDeSetting } from "../composants/setting/setting.js";
import { lineEmpty } from "../composants/line-empty/line-empty.js";
import { CET_ORDINATEUR, NON_ATTEINT, READ } from "../lexique.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {{ depots: string[] } | { refus: string }} ReadDesProjectsServed */
/**
 * Ce que l'écran demande au process principal. Absents, ou `projetsServis` qui ne rend rien : cet appareil n'a pas de
 * station (un téléphone), et rien ne se pose. `servirUnProjet` : l'écriture de la liste, que l'onglet Stations d'un projet
 * fait (ticket 3402) — cet écran ne l'appelle pas.
 * @typedef {{
 *   projetsServis?(): Promise<ReadDesProjectsServed | undefined>,
 *   servirUnProjet?(repository: string, served: boolean): Promise<ReadDesProjectsServed>,
 * }} PontDesProjectsServed
 */
/** Un projet de l'app : son nom, et son dépôt GitHub s'il est connu. @typedef {{ nom: string, depot?: string }} ProjectDeLApp */
/** @typedef {{ lecture?: ReadDesProjectsServed }} StateDesProjectsServed */

// Les mots de l'écran. `ici` : le nom que l'écran donne à cet ordinateur (« this Mac », « this PC »).
export const TITRE = (/** @type {string} */ ici) => `projects ${ici} serves`;
export const AUCUN = (/** @type {string} */ ici) => `${ici} serves no project`;
export const SERT = (/** @type {number} */ combien) => (combien === 1 ? "serves 1 project" : `serves ${combien} projects`);
export const AIDE = (/** @type {string} */ ici) =>
  `${ici}'s station cooks only the projects on this list, straight from GitHub: it clones each one on ${CET_ORDINATEUR} and takes its tickets. With none, it takes no ticket. A project is added or removed on its Stations tab.`;
export const SERVED = "served";
export const PAS_SERVED = "not served";
export const SANS_REPOSITORY = "The app does not know this project's GitHub repository: add it again from its repository to serve it here.";
export const OUTSIDE_DE_L_APP = "Not one of this app's projects: the station serves it because it is on its list. It changes from its Stations tab once it is one of the app's projects.";
export const ILLISIBLE = NON_ATTEINT("projects served here");

// Un dépôt se compare sans égard à la casse, comme la station le fait (projets-servis.ts).
const cle = (/** @type {string} */ repository) => repository.toLowerCase();

// Un refus de la station en une ligne : sa première proposition ; ce qui suit son tiret, au survol.
/** @param {string} refusal */
export function refusalDit(refusal) {
  const [line = refusal, ...suite] = refusal.split(" — ");
  return { ligne: `nothing was written: ${line.replace(/^brigade: /, "")}`, detail: suite.join(" — ") };
}

// L'état de l'écran. `rendre` : l'état a changé, l'écran se redessine.
/** @param {{ pont: PontDesProjectsServed, rendre: () => void }} options */
export function holdLesProjectsServed({ pont, rendre }) {
  /** @type {StateDesProjectsServed | undefined} */
  let state;
  let tour = 0;

  // La liste que la station tient. Une lecture qui ne rend rien : pas de station ici, l'écran se retire.
  async function lire() {
    const sien = ++tour;
    if (typeof pont.projetsServis !== "function") {
      state = undefined;
      return rendre();
    }
    /** @type {ReadDesProjectsServed | undefined} */
    const lue = await pont.projetsServis().catch((error) => ({ refus: error instanceof Error ? error.message : String(error) }));
    if (sien !== tour) return;
    if (lue === undefined) state = undefined;
    else {
      state ??= {};
      state.lecture = lue;
    }
    rendre();
  }

  return {
    /** @returns {StateDesProjectsServed | undefined} */
    get etat() {
      return state;
    },
    lire,
  };
}

// Les lignes de l'écran : une par projet de l'app, dans l'ordre de l'app, puis une par dépôt de la liste qu'aucun
// projet ne porte.
/** @param {readonly ProjectDeLApp[]} projects @param {readonly string[]} depots */
export function linesDesProjects(projects, depots) {
  const servedOnes = new Set(depots.map(cle));
  const connus = new Set();
  /** @type {{ nom: string, depot: string | null, servi: boolean, horsDeLApp: boolean }[]} */
  const lines = [];
  for (const project of projects) {
    const repository = project.depot?.trim() || null;
    if (repository !== null) connus.add(cle(repository));
    lines.push({ nom: project.nom, depot: repository, servi: repository !== null && servedOnes.has(cle(repository)), horsDeLApp: false });
  }
  for (const repository of depots) if (!connus.has(cle(repository))) lines.push({ nom: repository, depot: repository, servi: true, horsDeLApp: true });
  return lines;
}

// Chaque classe est posée en clair, `className = "…"` : la peau ne vise que des classes que la vue pose, et son test
// les lit ainsi (peau.test.ts).
/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const element = doc.createElement(balise);
  if (texte !== undefined) element.textContent = texte;
  return element;
}

// L'écran : la ligne d'en-tête — ce que sert cet ordinateur, ou qu'il n'en sert aucun —, puis une ligne par projet.
/** @param {Fabrique} doc @param {{ etat: StateDesProjectsServed, projets: readonly ProjectDeLApp[], ici: string }} quoi */
export function poserLesProjectsServed(doc, { etat: state, projets: projects, ici }) {
  const racine = cree(doc, "div");
  racine.className = "projets-servis";
  racine.ariaLive = "polite";
  const lue = state.lecture;
  const depots = lue !== undefined && "depots" in lue ? lue.depots : undefined;

  /** @type {any[]} */
  let valeur;
  if (lue === undefined) valeur = [cree(doc, "span", READ)];
  else if (depots === undefined) valeur = [lineError(doc, ILLISIBLE, "refus" in lue ? lue.refus : "")];
  else if (depots.length === 0) {
    const aucun = lineEmpty(doc, AUCUN(ici), { classe: "aucun", balise: "strong" });
    valeur = [aucun, survol(doc, AIDE(ici))];
  } else valeur = [cree(doc, "span", SERT(depots.length)), survol(doc, AIDE(ici))];
  const tete = rangeeDeSetting(doc, { nom: TITRE(ici), valeur, classe: "tete" });
  racine.append(tete);
  if (depots === undefined) return racine;

  for (const line of linesDesProjects(projects, depots)) {
    // Le dépôt d'un projet de l'app se lit à côté de son nom ; un dépôt hors de l'app est son nom.
    /** @type {any} */
    let repositoryDit;
    if (!line.horsDeLApp && line.depot !== null) {
      repositoryDit = cree(doc, "small", line.depot);
      repositoryDit.className = "mono depot";
    }
    /** @type {any[]} */
    const vaut = [];
    if (line.depot === null) vaut.push(cree(doc, "span", "–"), survol(doc, SANS_REPOSITORY));
    else {
      const word = cree(doc, line.servi ? "strong" : "span", line.servi ? SERVED : PAS_SERVED);
      if (line.servi) word.className = "servi";
      else word.className = "pas-servi";
      vaut.push(word);
      if (line.horsDeLApp) vaut.push(survol(doc, OUTSIDE_DE_L_APP));
    }
    const rang = rangeeDeSetting(doc, { nom: line.nom, valeur: vaut });
    if (repositoryDit !== undefined) rang.children[0].append(repositoryDit);
    if (line.horsDeLApp) rang.children[0].className = "nom mono";
    rang.dataset.projet = line.nom;
    racine.append(rang);
  }
  return racine;
}
