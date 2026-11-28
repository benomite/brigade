// @ts-check
// Un projet dont la mise en place vient de passer, et qu'aucune station ne sert (ticket 3400, épique 3396) : sa page
// demande aussitôt qui le sert. Sans cela, ses tickets `fire` attendent sur le rail sans que rien ne le dise.
//   - Quand : la vue a lu le projet pas préparé pour Brigade (`checkRepoSetup`, ticket 2628), puis préparé — la PR de
//     mise en place mergée (ticket 3170), ou « Set up for Brigade » fait d'ici. Une lecture prête d'emblée ne demande
//     rien : rien n'a été mis en place sous les yeux du chef.
//   - Pas si une station le sert déjà : rien n'est forcé. Tant que ce qui sert le projet n'est pas lu, rien n'est décidé.
//   - Le choix est celui de « qui le cuit » (stations-tab/choice.js, ticket 3195) : cet ordinateur en tête, par le geste
//     de Settings « projects this Mac serves » (`servirUnProjet`, projets-servis/) ; puis les stations du compte.
//   - « not now » range la question : elle ne revient pas tant que l'app tourne.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (bricks.js), et rend des éléments.

import { buttonAction } from "../bricks.js";
import { AT_RETURN } from "../choice-station/choice-station.js";
import { setTheChoice } from "../stations-tab/choice.js";
import { refusalSays } from "../projects-served/projects-served.js";

/** @typedef {import("../bricks.js").Fabrique} Fabrique */
/** @typedef {import("../stations-tab/choice.js").Choice} Choice */
// Où en est la question d'un projet.
//   a-juger    sa mise en place vient de passer : reste à lire si une station le sert
//   question   aucune ne le sert : la page demande laquelle
//   enCours    le choix s'écrit (`cle` : la machine choisie)
//   refus      il n'a pas été écrit : une ligne, son détail au survol — les boutons sont rendus
//   servi      la machine choisie le sert (`nom`, `ici`, `absente` : choisie hors ligne)
/**
 * @typedef {{ etape: "a-juger" }
 *   | { etape: "question" }
 *   | { etape: "enCours", cle: string }
 *   | { etape: "refus", ligne: string, detail: string }
 *   | { etape: "servi", nom: string, ici: boolean, absente: boolean }} State
 */
/** @typedef {{ choisir(choice: Choice): void, ecarter(): void, fermer(): void }} Actions */

export const QUESTION = (/** @type {string} */ repository) => `Which station serves ${repository}?`;
export const NOBODY = (/** @type {string} */ repository) => `${repository} is set up for Brigade, but no station serves it: its fire tickets wait on the rail until one does.`;
export const LATER = "not now";
export const CLOSE = "close";
// Cet ordinateur choisi : sa station relit la liste à son tour suivant, dans les deux minutes (projets-servis/, `AIDE`).
export const SERVED_HERE = (/** @type {string} */ repository) => `This computer serves ${repository}: its station takes its fire tickets at its next turn, within two minutes.`;
export const SERVED_BY = (/** @type {string} */ name, /** @type {string} */ repository) => `${repository} is chosen for ${name}: it serves it once it has read the choice.`;

const NOT_READY = new Set(["manque", "en-route", "refus"]);

// L'état des questions, projet par projet, le temps que l'app tourne. `rendre` : celle du projet a changé.
/** @param {{ rendre: (project: string) => void }} options */
export function holdTheRequestsOfStation({ rendre: render }) {
  /** @type {Map<string, State>} */
  const heldEntries = new Map();
  // Les projets lus pas préparés, puis ceux dont la question a été rangée : celle-ci ne revient pas.
  /** @type {Set<string>} */
  const notReady = new Set();
  /** @type {Set<string>} */
  const ecartes = new Set();
  /** @param {string} project @param {State | undefined} state */
  const set = (project, state) => {
    if (state === undefined) heldEntries.delete(project);
    else heldEntries.set(project, state);
    render(project);
  };
  return {
    /** @param {string} project @returns {State | undefined} */
    de: (project) => heldEntries.get(project),
    // Ce que la lecture de la mise en place dit du projet (repository-not-prepare.js, `etape`) : pas préparé, il est retenu ;
    // préparé après l'avoir été, la question est à juger.
    /** @param {string} project @param {string} step */
    preparation(project, step) {
      if (NOT_READY.has(step)) notReady.add(project);
      if (step !== "prepare" || !notReady.has(project)) return;
      notReady.delete(project);
      if (!ecartes.has(project) && heldEntries.get(project) === undefined) set(project, { etape: "a-juger" });
    },
    // Ce qui sert le projet est lu : `servi`, une station le sert — rien n'est demandé ; sinon, la question est posée.
    /** @param {string} project @param {boolean} served */
    juger(project, served) {
      if (heldEntries.get(project)?.etape !== "a-juger") return;
      set(project, served ? undefined : { etape: "question" });
    },
    /** @param {string} project @param {string} key */
    choisir(project, key) {
      const before = heldEntries.get(project)?.etape;
      if (before === "question" || before === "refus") set(project, { etape: "enCours", cle: key });
    },
    // Ce que le geste a rendu (`ajouterLaStation`, parcours-premier-projet/) : ajoutée, ou son refus en une ligne.
    /** @param {string} project @param {"ajoutee" | { ligne: string, detail: string } | string | object} rendered @param {{ nom: string, ici: boolean, absente: boolean }} chosenOne */
    choisi(project, rendered, chosenOne) {
      if (heldEntries.get(project)?.etape !== "enCours") return;
      if (rendered === "ajoutee") return set(project, { etape: "servi", ...chosenOne });
      const refusal = typeof rendered === "object" && rendered !== null && "ligne" in rendered ? /** @type {{ ligne: string, detail?: string }} */ (rendered) : { ligne: String(rendered), detail: "" };
      set(project, { etape: "refus", ligne: refusal.ligne, detail: refusal.detail ?? "" });
    },
    // « not now » : la question part, et ne revient pas tant que l'app tourne.
    /** @param {string} project */
    ecarter(project) {
      ecartes.add(project);
      set(project, undefined);
    },
    // Servi, la confirmation lue : elle part.
    /** @param {string} project */
    fermer(project) {
      if (heldEntries.has(project)) set(project, undefined);
    },
  };
}

/** @param {Fabrique} doc @param {string} balise @param {string} classe @param {string} [text] */
function created(doc, balise, classe, text) {
  const element = doc.createElement(balise);
  if (classe !== "") element.className = classe;
  if (text !== undefined) element.textContent = text;
  return element;
}

/** @param {Fabrique} doc @param {any[]} buttons */
function actions(doc, buttons) {
  const row = created(doc, "div", "gestes");
  row.append(...buttons);
  return row;
}

// La question, au-dessus du rail : ce qui est attendu, pourquoi en une phrase, un bouton par machine — cet ordinateur en
// tête —, et « not now ». Servi : une phrase, et « close ». `etat` n'est jamais `a-juger` ici : rien ne se pose encore.
/** @param {Fabrique} doc @param {{ depot: string, etat: Exclude<State, { etape: "a-juger" }>, choix: readonly Choice[] }} donnees @param {Actions} action */
export function setTheRequestOfStation(doc, { depot: repository, etat: state, choix: choice }, action) {
  const root = created(doc, "section", "installation-projet carte");
  root.ariaLabel = QUESTION(repository);
  root.dataset.etape = state.etape;
  if (state.etape === "servi") {
    const said = state.absente ? AT_RETURN(state.nom, repository) : state.ici ? SERVED_HERE(repository) : SERVED_BY(state.nom, repository);
    root.append(created(doc, "p", "phrase", said), actions(doc, [buttonAction(doc, CLOSE, action.fermer)]));
    return root;
  }
  const inProgress = state.etape === "enCours" ? state.cle : undefined;
  const refusal = state.etape === "refus" ? { ligne: state.ligne, detail: state.detail } : undefined;
  const later = buttonAction(doc, LATER, action.ecarter, { sorte: "discret" });
  const button = later.children?.[0];
  if (button !== undefined) button.disabled = inProgress !== undefined;
  // Les machines, puis « not now » sur la même ligne ; un refus, dessous.
  const [list, ...below] = setTheChoice(doc, { choix: choice, ...(inProgress === undefined ? {} : { enCours: inProgress }), ...(refusal === undefined ? {} : { refus: refusal }) }, action.choisir);
  root.append(created(doc, "h2", "attendu", QUESTION(repository)), created(doc, "p", "phrase", NOBODY(repository)), actions(doc, [list, later]), ...below);
  return root;
}

export const UNREACHABLE = (/** @type {string} */ name) => `${name} could not be given the project.`;

// La station choisie par le geste que l'app a déjà : ce qu'il rend en devient l'état — ajoutée, ou son refus en une ligne.
/** @param {string} name @param {() => Promise<{ refus: string, detail?: string } | object>} write @returns {Promise<"ajoutee" | { ligne: string, detail: string }>} */
export async function addTheStation(name, write) {
  try {
    const readOne = await write();
    if (!("refus" in readOne)) return "ajoutee";
    const said = refusalSays(readOne.refus.replace(/^not saved: /, ""));
    return "detail" in readOne && readOne.detail !== undefined ? { ...said, detail: [said.detail, readOne.detail].filter((end) => end !== "").join(" — ") } : said;
  } catch (error) {
    return { ligne: UNREACHABLE(name), detail: error instanceof Error ? error.message : String(error) };
  }
}
