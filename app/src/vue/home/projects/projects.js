// @ts-check
// Le bloc « Projects » de l'accueil (ticket 2639, épique 2497) : une ligne par projet, qui dit d'un coup d'œil où il en
// est — il cuit, il attend le chef, il est retenu, il est au repos — et les stations qui le cuisinent ; tout un clic
// l'ouvre. Sous la liste, « Add a project » lance le parcours d'ajout unique (journey-project/, épique 2473) : ce
// bloc ne le refait pas, il appelle son point d'entrée (`ajouter`). Une liste vide se dit en une ligne, et le bouton
// reste ; un projet sans station le dit.
//
// Ce module ne touche pas `document` : la vue lui donne une fabrique (briques.js), les tests un faux.

import { buttonAction } from "../../briques.js";
import { AJOUTER_UN_PROJECT } from "../../lexique.js";

// La ligne d'un projet au rail bloqué (rail-blocked/rail-blocked.ts, `ditALAccueil`).
export const RAIL_BLOCKED = /^\d+ tickets? no manager takes, for /;

/** @typedef {import("../../briques.js").Fabrique} Fabrique */
/** @typedef {"cooking" | "waiting" | "held" | "stuck" | "paused" | "idle" | "breaker"} StateDeProject */
// `maintenant` : ce qui s'y passe, en une phrase (home.ts) ; `attend` : combien de décisions attendent le chef, absent quand aucune.
/** @typedef {{ nom: string, etat: StateDeProject, stations: string[], maintenant: string, attend?: number, survol?: string }} ProjectDuBloc */
/** @typedef {{ ouvrir(name: string): void, ajouter(): void, pastille?(dit: string, ton: string): any }} ActionsDuBloc */

// Les quatre états, dans les mots de l'app, avec le ton de leur pastille (vue.css) : le chef attendu est jaune, un
// projet retenu rouge, celui qui cuit vert, celui au repos gris.
/** @type {Record<StateDeProject, { dit: string, ton: string }>} */
export const STATES = {
  cooking: { dit: "cooking", ton: "vert" },
  waiting: { dit: "waiting for the chef", ton: "jaune" },
  held: { dit: "held", ton: "rouge" },
  // Le rail bloqué (rail-blocked/, ticket 3358) : des tickets qu'aucun manager ne prend.
  stuck: { dit: "stuck", ton: "rouge" },
  // La pause de quota GitHub du compte (pause-quota/, ticket 3482) : rien n'y est en panne, il reprend seul.
  paused: { dit: "paused", ton: "bleu" },
  idle: { dit: "idle", ton: "gris" },
  // La cuisine retenue par son disjoncteur (ticket 3602) : la cause que la ligne de l'accueil porte déjà (home.ts, `causes`)
  // devient l'état du projet, en place de « stuck » quand son rail est aussi bloqué.
  breaker: { dit: "held: breaker open", ton: "rouge" },
};
// La ligne d'un projet dont le disjoncteur est ouvert (home.ts, `causes`).
const BREAKER_OUVERT = /^breaker open$/;
// Les parties de la ligne, telles que l'accueil les joint (home.ts, `ligneDeProjet`).
const SEPARATEUR = " · ";
const parties = (/** @type {string} */ dit) => dit.split(SEPARATEUR);
// L'état d'un projet, d'après la ligne que l'accueil en dit (home.ts) : rouge, il est retenu ; jaune, il attend le chef ;
// vert, il cuit s'il a des cooks ou des tickets à la pass, sinon il est au repos ; gris, rien n'y est lu — au repos.
/** @param {{ ton: string, dit: string }} ligne @returns {StateDeProject} */
export function stateDeLaLine({ ton, dit }) {
  if (ton === "rouge") return parties(dit).some((partie) => BREAKER_OUVERT.test(partie)) ? "breaker" : RAIL_BLOCKED.test(dit) ? "stuck" : "held";
  if (ton === "jaune") return "waiting";
  if (ton === "bleu") return "paused";
  return ton === "vert" && !/^nothing cooking/.test(dit) && /cooking|at work|at the pass/.test(dit) ? "cooking" : "idle";
}
// Ce que la ligne d'un projet retenu par son disjoncteur dit en plus de son état : ni le disjoncteur, déjà l'état, ni le rail
// bloqué, qu'il explique — aucun manager ne prend rien tant que le disjoncteur est ouvert.
/** @param {{ ton: string, dit: string }} line */
export function maintenantDeLaLine(line) {
  if (stateDeLaLine(line) !== "breaker") return line.dit;
  const reste = parties(line.dit).filter((partie) => !BREAKER_OUVERT.test(partie) && !RAIL_BLOCKED.test(partie));
  return reste.length === 0 ? "no cook goes any more" : reste.join(SEPARATEUR);
}
export const SANS_STATION = "no station";
export const AJOUTER = AJOUTER_UN_PROJECT;
export const AWAITING = "awaiting you";

// Une ligne : la pastille, le nom, l'état, ce qui s'y passe, ce qui attend le chef — et la flèche. Les stations se lisent
// dans le nom accessible de la ligne. Un seul bouton, donc un seul clic.
/** @param {Fabrique} doc @param {ProjectDuBloc} project @param {ActionsDuBloc} actions */
function line(doc, project, actions) {
  const { dit, ton } = STATES[project.etat];
  const stations = project.stations.length === 0 ? SANS_STATION : project.stations.join(", ");
  const racine = doc.createElement("button");
  racine.type = "button";
  racine.className = "ligne";
  racine.ariaLabel = `${project.nom} — ${dit} — ${stations}`;
  if (project.survol !== undefined) racine.title = project.survol;
  const pill = actions.pastille?.(dit, ton) ?? doc.createElement("span");
  if (actions.pastille === undefined) {
    pill.className = "pastille";
    pill.dataset.ton = ton;
    pill.title = dit;
  }
  const name = doc.createElement("strong");
  name.className = "mono";
  name.textContent = project.nom;
  const state = doc.createElement("span");
  state.className = "etat";
  state.textContent = dit;
  const maintenant = doc.createElement("span");
  maintenant.className = "maintenant";
  maintenant.textContent = project.maintenant;
  const suite = doc.createElement("span");
  suite.className = "ouvrir";
  suite.ariaHidden = "true";
  suite.textContent = "›";
  racine.append(pill, name, state, maintenant);
  if (project.attend !== undefined && project.attend > 0) {
    const awaiting = doc.createElement("span");
    awaiting.className = "attend";
    awaiting.textContent = `${project.attend} ${AWAITING}`;
    racine.append(awaiting);
  }
  racine.append(suite);
  racine.addEventListener("click", () => actions.ouvrir(project.nom));
  return racine;
}

// Les lignes seules, pour l'accueil qui pose le bouton d'ajout lui-même.
/** @param {Fabrique} doc @param {ProjectDuBloc[]} projects @param {ActionsDuBloc} actions */
export const linesDeProjects = (doc, projects, actions) => projects.map((project) => line(doc, project, actions));

// Le bouton d'ajout : il lance le parcours d'ajout unique (épique 2473).
/** @param {Fabrique} doc @param {ActionsDuBloc} actions @param {boolean} aucun */
export const buttonDAddition = (doc, actions, aucun) => buttonAction(doc, AJOUTER, () => actions.ajouter(), { recommande: aucun });
