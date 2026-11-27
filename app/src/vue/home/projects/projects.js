// @ts-check
// Le bloc « Projects » de l'accueil (ticket 2639, épique 2497) : une ligne par projet, qui dit d'un coup d'œil où il en
// est — il cuit, il attend le chef, il est retenu, il est au repos — et les stations qui le cuisinent ; tout un clic
// l'ouvre. Sous la liste, « Add a project » lance le parcours d'ajout unique (parcours-projet/, épique 2473) : ce
// bloc ne le refait pas, il appelle son point d'entrée (`ajouter`). Une liste vide se dit en une ligne, et le bouton
// reste ; un projet sans station le dit.
//
// Ce module ne touche pas `document` : la vue lui donne une fabrique (bricks.js), les tests un faux.

import { buttonAction } from "../../bricks.js";
import { ADD_ONE_PROJECT } from "../../lexicon.js";

// La ligne d'un projet au rail bloqué (rail-blocked/rail-blocked.ts, `ditALAccueil`).
export const RAIL_BLOCKED = /^\d+ tickets? no manager takes, for /;

/** @typedef {import("../../bricks.js").Fabrique} Fabrique */
/** @typedef {"cooking" | "waiting" | "held" | "stuck" | "paused" | "idle" | "breaker"} StateOfProject */
// `maintenant` : ce qui s'y passe, en une phrase (home.ts) ; `attend` : combien de décisions attendent le chef, absent quand aucune.
/** @typedef {{ nom: string, etat: StateOfProject, stations: string[], maintenant: string, attend?: number, survol?: string }} ProjectOfBlock */
/** @typedef {{ ouvrir(name: string): void, ajouter(): void, pastille?(said: string, your: string): any }} ActionsOfBlock */

// Les quatre états, dans les mots de l'app, avec le ton de leur pastille (vue.css) : le chef attendu est jaune, un
// projet retenu rouge, celui qui cuit vert, celui au repos gris.
/** @type {Record<StateOfProject, { dit: string, ton: string }>} */
export const STATES = {
  cooking: { dit: "cooking", ton: "vert" },
  waiting: { dit: "waiting for the chef", ton: "jaune" },
  held: { dit: "held", ton: "rouge" },
  // Le rail bloqué (rail-bloque/, ticket 3358) : des tickets qu'aucun manager ne prend.
  stuck: { dit: "stuck", ton: "rouge" },
  // La pause de quota GitHub du compte (pause-quota/, ticket 3482) : rien n'y est en panne, il reprend seul.
  paused: { dit: "paused", ton: "bleu" },
  idle: { dit: "idle", ton: "gris" },
  // La cuisine retenue par son disjoncteur (ticket 3602) : la cause que la ligne de l'accueil porte déjà (home.ts, `causes`)
  // devient l'état du projet, en place de « stuck » quand son rail est aussi bloqué.
  breaker: { dit: "held: breaker open", ton: "rouge" },
};
// La ligne d'un projet dont le disjoncteur est ouvert (home.ts, `causes`).
const BREAKER_OPEN = /^breaker open$/;
// Les parties de la ligne, telles que l'accueil les joint (home.ts, `ligneDeProjet`).
const SEPARATOR = " · ";
const parties = (/** @type {string} */ said) => said.split(SEPARATOR);
// L'état d'un projet, d'après la ligne que l'accueil en dit (home.ts) : rouge, il est retenu ; jaune, il attend le chef ;
// vert, il cuit s'il a des cooks ou des tickets à la pass, sinon il est au repos ; gris, rien n'y est lu — au repos.
/** @param {{ ton: string, dit: string }} ligne @returns {StateOfProject} */
export function stateOfTheLine({ ton: your, dit: said }) {
  if (your === "rouge") return parties(said).some((part) => BREAKER_OPEN.test(part)) ? "breaker" : RAIL_BLOCKED.test(said) ? "stuck" : "held";
  if (your === "jaune") return "waiting";
  if (your === "bleu") return "paused";
  return your === "vert" && !/^nothing cooking/.test(said) && /cooking|at work|at the pass/.test(said) ? "cooking" : "idle";
}
// Ce que la ligne d'un projet retenu par son disjoncteur dit en plus de son état : ni le disjoncteur, déjà l'état, ni le rail
// bloqué, qu'il explique — aucun manager ne prend rien tant que le disjoncteur est ouvert.
/** @param {{ ton: string, dit: string }} line */
export function nowOfTheLine(line) {
  if (stateOfTheLine(line) !== "breaker") return line.dit;
  const remains = parties(line.dit).filter((part) => !BREAKER_OPEN.test(part) && !RAIL_BLOCKED.test(part));
  return remains.length === 0 ? "no cook goes any more" : remains.join(SEPARATOR);
}
export const WITHOUT_STATION = "no station";
export const ADD = ADD_ONE_PROJECT;
export const AWAITING = "awaiting you";

// Une ligne : la pastille, le nom, l'état, ce qui s'y passe, ce qui attend le chef — et la flèche. Les stations se lisent
// dans le nom accessible de la ligne. Un seul bouton, donc un seul clic.
/** @param {Fabrique} doc @param {ProjectOfBlock} project @param {ActionsOfBlock} actions */
function line(doc, project, actions) {
  const { dit: said, ton: your } = STATES[project.etat];
  const stations = project.stations.length === 0 ? WITHOUT_STATION : project.stations.join(", ");
  const root = doc.createElement("button");
  root.type = "button";
  root.className = "ligne";
  root.ariaLabel = `${project.nom} — ${said} — ${stations}`;
  if (project.survol !== undefined) root.title = project.survol;
  const pill = actions.pastille?.(said, your) ?? doc.createElement("span");
  if (actions.pastille === undefined) {
    pill.className = "pastille";
    pill.dataset.ton = your;
    pill.title = said;
  }
  const name = doc.createElement("strong");
  name.className = "mono";
  name.textContent = project.nom;
  const state = doc.createElement("span");
  state.className = "etat";
  state.textContent = said;
  const now = doc.createElement("span");
  now.className = "maintenant";
  now.textContent = project.maintenant;
  const suite = doc.createElement("span");
  suite.className = "ouvrir";
  suite.ariaHidden = "true";
  suite.textContent = "›";
  root.append(pill, name, state, now);
  if (project.attend !== undefined && project.attend > 0) {
    const awaiting = doc.createElement("span");
    awaiting.className = "attend";
    awaiting.textContent = `${project.attend} ${AWAITING}`;
    root.append(awaiting);
  }
  root.append(suite);
  root.addEventListener("click", () => actions.ouvrir(project.nom));
  return root;
}

// Les lignes seules, pour l'accueil qui pose le bouton d'ajout lui-même.
/** @param {Fabrique} doc @param {ProjectOfBlock[]} projects @param {ActionsOfBlock} actions */
export const linesOfProjects = (doc, projects, actions) => projects.map((project) => line(doc, project, actions));

// Le bouton d'ajout : il lance le parcours d'ajout unique (épique 2473).
/** @param {Fabrique} doc @param {ActionsOfBlock} actions @param {boolean} no */
export const buttonOfAddition = (doc, actions, no) => buttonAction(doc, ADD, () => actions.ajouter(), { recommande: no });
