// @ts-check
// L'écran de l'outil manquant (ticket 4059, épique 4054) : l'app a besoin de trois outils qu'elle ne livre pas — le
// GitHub CLI (`gh`) pour la connexion à GitHub, Git (`git`) pour le clone, Claude Code (`claude`) pour les cooks, le
// second et le login Max. Un pas qui en demande un le vérifie d'abord (`outilsManquants`, tools-required.ts) ; s'il
// manque, ce pas cède la place à cet écran, au même endroit : le produit nommé — le binaire au détail —, pourquoi
// l'app en a besoin en une phrase, un lien vers sa page d'installation officielle, et « I installed it », qui relit.
// L'app n'installe rien (ticket 4266) : installer est l'affaire du chef. L'outil trouvé, le pas revient tel qu'il était —
// rien n'est relancé à la place du chef. Un outil toujours absent se dit en une ligne, et l'offre reste.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (bricks.js), et rend des éléments.

import { buttonAction } from "../bricks.js";
import { sentence } from "../onboarding/journey.js";
import { actions } from "../journey-project/connection.js";
import { lineError } from "../components/line-error/line-error.js";
import { THIS_COMPUTER } from "../lexicon.js";

/** @typedef {import("../bricks.js").Fabrique} Fabrique */
/** @typedef {"gh" | "git" | "claude"} ToolRequired */
/** @typedef {{ outil: ToolRequired, installation?: import("../../tools-required.ts").ToolMissing["installation"] }} Missing */
/** @typedef {{ outilsManquants?(tools?: ToolRequired[]): Promise<Missing[]> }} BridgeOfTools */
/**
 * Ce que l'écran tient. `lu` : une vérification a rendu — avant, rien n'est sûr. `manque` : l'outil à installer, le
 * premier de ceux qui manquent. `enCours` : la vérification en route. `dit` : l'outil encore absent après « I installed
 * it ». `illisible` : la vérification n'a pas répondu.
 * @typedef {{
 *   lu: boolean,
 *   manque?: Missing,
 *   enCours?: "verification",
 *   dit?: { absent: true },
 *   illisible?: { refus: string, detail?: string },
 * }} StateOfTools
 */

/** @type {Record<ToolRequired, string>} */
export const NAMES = { gh: "the GitHub CLI", git: "Git", claude: "Claude Code" };
/** @type {Record<ToolRequired, string>} */
export const WHY = {
  gh: "brigade needs the GitHub CLI (`gh`) to sign you in to GitHub and read your projects there.",
  git: `brigade needs Git (\`git\`) to clone your projects onto ${THIS_COMPUTER}.`,
  claude: "brigade needs Claude Code (`claude`) to cook: the cooks and the second run on it, with your Max account.",
};
/** @param {ToolRequired} tool */
const Name = (tool) => NAMES[tool].replace(/^the /, "The ");
/** @param {ToolRequired} tool */
export const MISSING = (tool) => `${Name(tool)} is not installed on ${THIS_COMPUTER}.`;
/** @param {ToolRequired} tool */
export const THE_PAGE = (tool) => `how to install ${NAMES[tool]}`;
export const ALREADY_INSTALLS = "I installed it";
export const VERIFICATION = `Checking the tools of ${THIS_COMPUTER}…`;
/** @param {ToolRequired} tool */
export const ALWAYS_ABSENT = (tool) => `${Name(tool)} is still missing on ${THIS_COMPUTER}: install it, then click “${ALREADY_INSTALLS}”.`;
export const UNREADABLE = `The app could not check which tools ${THIS_COMPUTER} has.`;

const message = (/** @type {unknown} */ error) => (error instanceof Error ? error.message : String(error));

// Les outils d'un pas, tenus : `verifier` les relit — vrai quand aucun ne manque, ou que le pont ne sait pas les lire.
// `rendre` à chaque changement.
// `outils` : ceux que ce pas demande ; absents, les trois. `quandPret` : l'outil qui manquait est là — le pas qu'il
// retenait reprend.
/**
 * @param {{ pont: BridgeOfTools, rendre: () => void, outils?: ToolRequired[], quandPret?: () => void }} options
 * @returns {{ etat: StateOfTools, verifier: (afterOneAction?: boolean) => Promise<boolean> }}
 */
export function holdTheTools({ pont: bridge, rendre: render, outils: tools, quandPret: whenReady }) {
  /** @type {StateOfTools} */
  const state = { lu: false };
  let reading = 0;
  // `apresUnGeste` : le chef a dit l'avoir installé — un outil toujours absent se dit.
  async function check(afterOneAction = false) {
    if (bridge.outilsManquants === undefined) {
      state.lu = true;
      return true;
    }
    const requested = ++reading;
    const before = state.manque?.outil;
    state.enCours = "verification";
    render();
    /** @type {Missing[] | undefined} */
    let missing;
    try {
      missing = await bridge.outilsManquants(tools);
    } catch (error) {
      if (requested !== reading) return false;
      delete state.enCours;
      state.illisible = { refus: UNREADABLE, detail: message(error) };
      state.lu = true;
      render();
      // Rien ne se lit : le pas reste offert, et c'est lui qui dira ce qui l'empêche.
      return true;
    }
    if (requested !== reading) return false;
    delete state.enCours;
    delete state.illisible;
    state.lu = true;
    // Rien de rendu : ce pont ne lit pas les outils de sa machine (le téléphone n'en a pas) — le pas reste offert.
    if (missing === undefined) {
      render();
      return true;
    }
    const first = missing[0];
    if (first === undefined) {
      delete state.manque;
      delete state.dit;
      render();
      if (before !== undefined) whenReady?.();
      return true;
    }
    if (afterOneAction && first.outil === before) state.dit = { absent: true };
    else if (first.outil !== before) delete state.dit;
    state.manque = first;
    render();
    return false;
  }
  return { etat: state, verifier: check };
}

/** @param {Fabrique} doc @param {string} balise @param {string} text */
function created(doc, balise, text) {
  const pose = doc.createElement(balise);
  pose.textContent = text;
  return pose;
}

// L'écran : l'outil qui manque, pourquoi, le lien de sa page d'installation, « I installed it » et ce que la dernière
// vérification a rendu. Sans outil qui
// manque, ce qui se lit encore — la vérification en route, ou pourquoi elle ne se lit pas —, sinon rien.
/**
 * @param {Fabrique} doc @param {StateOfTools} state
 * @param {{ ouvrir: (url: string) => void, verifier: () => void }} action
 * @returns {any[]}
 */
export function setTheTools(doc, state, action) {
  const { manque: lack } = state;
  if (lack === undefined) {
    if (state.enCours === "verification") {
      const said = created(doc, "p", VERIFICATION);
      said.className = "dit";
      said.role = "status";
      return [said];
    }
    if (state.illisible !== undefined) return [lineError(doc, state.illisible.refus, state.illisible.detail, { classe: "refus" })];
    return [];
  }
  const { outil: tool, installation } = lack;
  const root = doc.createElement("section");
  root.className = "ecran-outil-manquant";
  root.dataset.outil = tool;
  const head = created(doc, "h3", MISSING(tool));
  const why = sentence(doc, "p", WHY[tool]);
  why.className = "pourquoi";
  root.append(head, why);
  const busy = state.enCours !== undefined;
  const link = installation === undefined ? undefined : buttonAction(doc, THE_PAGE(tool), () => action.ouvrir(installation.lien), { recommande: true });
  const rereads = buttonAction(doc, ALREADY_INSTALLS, action.verifier);
  rereads.children[0].disabled = busy;
  root.append(actions(doc, link === undefined ? [rereads] : [link, rereads]));
  const { dit: said } = state;
  if (state.enCours !== undefined) {
    const inRoute = created(doc, "p", VERIFICATION);
    inRoute.className = "dit";
    inRoute.role = "status";
    root.append(inRoute);
  } else if (said !== undefined) root.append(lineError(doc, ALWAYS_ABSENT(tool), "", { classe: "refus", alerte: true }));
  return [root];
}
