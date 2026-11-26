// @ts-check
// L'écran de l'outil manquant (ticket 4059, épique 4054) : l'app a besoin de trois outils qu'elle ne livre pas — le
// GitHub CLI (`gh`) pour la connexion à GitHub, Git (`git`) pour le clone, Claude Code (`claude`) pour les cooks, le
// second et le login Max. Un pas qui en demande un le vérifie d'abord (`outilsManquants`, tools-required.ts) ; s'il
// manque, ce pas cède la place à cet écran, au même endroit : le produit nommé — le binaire au détail —, pourquoi
// l'app en a besoin en une phrase, un lien vers sa page d'installation officielle, et « I installed it », qui relit.
// L'app n'installe rien (ticket 4266) : installer est l'affaire du chef. L'outil trouvé, le pas revient tel qu'il était —
// rien n'est relancé à la place du chef. Un outil toujours absent se dit en une ligne, et l'offre reste.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js), et rend des éléments.

import { buttonAction } from "../briques.js";
import { phrase } from "../onboarding/journey.js";
import { actions } from "../journey-project/connection.js";
import { lineError } from "../composants/line-error/line-error.js";
import { CET_ORDINATEUR } from "../lexique.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {"gh" | "git" | "claude"} ToolRequired */
/** @typedef {{ outil: ToolRequired, installation?: import("../../tools-required.ts").ToolManquant["installation"] }} Manque */
/** @typedef {{ outilsManquants?(tools?: ToolRequired[]): Promise<Manque[]> }} PontDesTools */
/**
 * Ce que l'écran tient. `lu` : une vérification a rendu — avant, rien n'est sûr. `manque` : l'outil à installer, le
 * premier de ceux qui manquent. `enCours` : la vérification en route. `dit` : l'outil encore absent après « I installed
 * it ». `illisible` : la vérification n'a pas répondu.
 * @typedef {{
 *   lu: boolean,
 *   manque?: Manque,
 *   enCours?: "verification",
 *   dit?: { absent: true },
 *   illisible?: { refus: string, detail?: string },
 * }} StateDesTools
 */

/** @type {Record<ToolRequired, string>} */
export const NOMS = { gh: "the GitHub CLI", git: "Git", claude: "Claude Code" };
/** @type {Record<ToolRequired, string>} */
export const POURQUOI = {
  gh: "brigade needs the GitHub CLI (`gh`) to sign you in to GitHub and read your projects there.",
  git: `brigade needs Git (\`git\`) to clone your projects onto ${CET_ORDINATEUR}.`,
  claude: "brigade needs Claude Code (`claude`) to cook: the cooks and the second run on it, with your Max account.",
};
/** @param {ToolRequired} tool */
const Name = (tool) => NOMS[tool].replace(/^the /, "The ");
/** @param {ToolRequired} tool */
export const MANQUE = (tool) => `${Name(tool)} is not installed on ${CET_ORDINATEUR}.`;
/** @param {ToolRequired} tool */
export const LA_PAGE = (tool) => `how to install ${NOMS[tool]}`;
export const DEJA_INSTALLE = "I installed it";
export const VERIFICATION = `Checking the tools of ${CET_ORDINATEUR}…`;
/** @param {ToolRequired} tool */
export const TOUJOURS_ABSENT = (tool) => `${Name(tool)} is still missing on ${CET_ORDINATEUR}: install it, then click “${DEJA_INSTALLE}”.`;
export const ILLISIBLE = `The app could not check which tools ${CET_ORDINATEUR} has.`;

const message = (/** @type {unknown} */ error) => (error instanceof Error ? error.message : String(error));

// Les outils d'un pas, tenus : `verifier` les relit — vrai quand aucun ne manque, ou que le pont ne sait pas les lire.
// `rendre` à chaque changement.
// `outils` : ceux que ce pas demande ; absents, les trois. `quandPret` : l'outil qui manquait est là — le pas qu'il
// retenait reprend.
/**
 * @param {{ pont: PontDesTools, rendre: () => void, outils?: ToolRequired[], quandPret?: () => void }} options
 * @returns {{ etat: StateDesTools, verifier: (apresUnAction?: boolean) => Promise<boolean> }}
 */
export function holdLesTools({ pont, rendre, outils: tools, quandPret }) {
  /** @type {StateDesTools} */
  const state = { lu: false };
  let read = 0;
  // `apresUnGeste` : le chef a dit l'avoir installé — un outil toujours absent se dit.
  async function verifier(apresUnAction = false) {
    if (pont.outilsManquants === undefined) {
      state.lu = true;
      return true;
    }
    const demandee = ++read;
    const avant = state.manque?.outil;
    state.enCours = "verification";
    rendre();
    /** @type {Manque[] | undefined} */
    let manquants;
    try {
      manquants = await pont.outilsManquants(tools);
    } catch (error) {
      if (demandee !== read) return false;
      delete state.enCours;
      state.illisible = { refus: ILLISIBLE, detail: message(error) };
      state.lu = true;
      rendre();
      // Rien ne se lit : le pas reste offert, et c'est lui qui dira ce qui l'empêche.
      return true;
    }
    if (demandee !== read) return false;
    delete state.enCours;
    delete state.illisible;
    state.lu = true;
    // Rien de rendu : ce pont ne lit pas les outils de sa machine (le téléphone n'en a pas) — le pas reste offert.
    if (manquants === undefined) {
      rendre();
      return true;
    }
    const first = manquants[0];
    if (first === undefined) {
      delete state.manque;
      delete state.dit;
      rendre();
      if (avant !== undefined) quandPret?.();
      return true;
    }
    if (apresUnAction && first.outil === avant) state.dit = { absent: true };
    else if (first.outil !== avant) delete state.dit;
    state.manque = first;
    rendre();
    return false;
  }
  return { etat: state, verifier };
}

/** @param {Fabrique} doc @param {string} balise @param {string} texte */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  pose.textContent = texte;
  return pose;
}

// L'écran : l'outil qui manque, pourquoi, le lien de sa page d'installation, « I installed it » et ce que la dernière
// vérification a rendu. Sans outil qui
// manque, ce qui se lit encore — la vérification en route, ou pourquoi elle ne se lit pas —, sinon rien.
/**
 * @param {Fabrique} doc @param {StateDesTools} state
 * @param {{ ouvrir: (url: string) => void, verifier: () => void }} action
 * @returns {any[]}
 */
export function poserLesTools(doc, state, action) {
  const { manque } = state;
  if (manque === undefined) {
    if (state.enCours === "verification") {
      const dit = cree(doc, "p", VERIFICATION);
      dit.className = "dit";
      dit.role = "status";
      return [dit];
    }
    if (state.illisible !== undefined) return [lineError(doc, state.illisible.refus, state.illisible.detail, { classe: "refus" })];
    return [];
  }
  const { outil: tool, installation } = manque;
  const racine = doc.createElement("section");
  racine.className = "ecran-outil-manquant";
  racine.dataset.outil = tool;
  const tete = cree(doc, "h3", MANQUE(tool));
  const pourquoi = phrase(doc, "p", POURQUOI[tool]);
  pourquoi.className = "pourquoi";
  racine.append(tete, pourquoi);
  const occupe = state.enCours !== undefined;
  const lien = installation === undefined ? undefined : buttonAction(doc, LA_PAGE(tool), () => action.ouvrir(installation.lien), { recommande: true });
  const relit = buttonAction(doc, DEJA_INSTALLE, action.verifier);
  relit.children[0].disabled = occupe;
  racine.append(actions(doc, lien === undefined ? [relit] : [lien, relit]));
  const { dit } = state;
  if (state.enCours !== undefined) {
    const enRoute = cree(doc, "p", VERIFICATION);
    enRoute.className = "dit";
    enRoute.role = "status";
    racine.append(enRoute);
  } else if (dit !== undefined) racine.append(lineError(doc, TOUJOURS_ABSENT(tool), "", { classe: "refus", alerte: true }));
  return [racine];
}
