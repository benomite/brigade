// @ts-check
// Un projet dont la mise en place vient de passer, et qu'aucune station ne sert (ticket 3400, épique 3396) : sa page
// demande aussitôt qui le sert. Sans cela, ses tickets `fire` attendent sur le rail sans que rien ne le dise.
//   - Quand : la vue a lu le projet pas préparé pour Brigade (`checkRepoSetup`, ticket 2628), puis préparé — la PR de
//     mise en place mergée (ticket 3170), ou « Set up for Brigade » fait d'ici. Une lecture prête d'emblée ne demande
//     rien : rien n'a été mis en place sous les yeux du chef.
//   - Pas si une station le sert déjà : rien n'est forcé. Tant que ce qui sert le projet n'est pas lu, rien n'est décidé.
//   - Le choix est celui de « qui le cuit » (stations-tab/choice.js, ticket 3195) : cet ordinateur en tête, par le geste
//     de Settings « projects this Mac serves » (`servirUnProjet`, projects-served/) ; puis les stations du compte.
//   - « not now » range la question : elle ne revient pas tant que l'app tourne.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js), et rend des éléments.

import { buttonAction } from "../briques.js";
import { AU_RETOUR } from "../choice-station/choice-station.js";
import { poserLesChoice } from "../stations-tab/choice.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
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
export const PERSONNE = (/** @type {string} */ repository) => `${repository} is set up for Brigade, but no station serves it: its fire tickets wait on the rail until one does.`;
export const PLUS_TARD = "not now";
export const FERMER = "close";
// Cet ordinateur choisi : sa station relit la liste à son tour suivant, dans les deux minutes (projects-served/, `AIDE`).
export const SERVED_ICI = (/** @type {string} */ repository) => `This computer serves ${repository}: its station takes its fire tickets at its next turn, within two minutes.`;
export const SERVED_PAR = (/** @type {string} */ name, /** @type {string} */ repository) => `${repository} is chosen for ${name}: it serves it once it has read the choice.`;

const PAS_PRET = new Set(["manque", "en-route", "refus"]);

// L'état des questions, projet par projet, le temps que l'app tourne. `rendre` : celle du projet a changé.
/** @param {{ rendre: (project: string) => void }} options */
export function holdLesDemandesDeStation({ rendre }) {
  /** @type {Map<string, State>} */
  const tenues = new Map();
  // Les projets lus pas préparés, puis ceux dont la question a été rangée : celle-ci ne revient pas.
  /** @type {Set<string>} */
  const pasPrets = new Set();
  /** @type {Set<string>} */
  const ecartes = new Set();
  /** @param {string} project @param {State | undefined} state */
  const poser = (project, state) => {
    if (state === undefined) tenues.delete(project);
    else tenues.set(project, state);
    rendre(project);
  };
  return {
    /** @param {string} project @returns {State | undefined} */
    de: (project) => tenues.get(project),
    // Ce que la lecture de la mise en place dit du projet (repository-non-prepare.js, `etape`) : pas préparé, il est retenu ;
    // préparé après l'avoir été, la question est à juger.
    /** @param {string} project @param {string} step */
    preparation(project, step) {
      if (PAS_PRET.has(step)) pasPrets.add(project);
      if (step !== "prepare" || !pasPrets.has(project)) return;
      pasPrets.delete(project);
      if (!ecartes.has(project) && tenues.get(project) === undefined) poser(project, { etape: "a-juger" });
    },
    // Ce qui sert le projet est lu : `servi`, une station le sert — rien n'est demandé ; sinon, la question est posée.
    /** @param {string} project @param {boolean} served */
    juger(project, served) {
      if (tenues.get(project)?.etape !== "a-juger") return;
      poser(project, served ? undefined : { etape: "question" });
    },
    /** @param {string} project @param {string} cle */
    choisir(project, cle) {
      const avant = tenues.get(project)?.etape;
      if (avant === "question" || avant === "refus") poser(project, { etape: "enCours", cle });
    },
    // Ce que le geste a rendu (`ajouterLaStation`, journey-first-project/) : ajoutée, ou son refus en une ligne.
    /** @param {string} project @param {"ajoutee" | { ligne: string, detail: string } | string | object} rendu @param {{ nom: string, ici: boolean, absente: boolean }} choisie */
    choisi(project, rendu, choisie) {
      if (tenues.get(project)?.etape !== "enCours") return;
      if (rendu === "ajoutee") return poser(project, { etape: "servi", ...choisie });
      const refusal = typeof rendu === "object" && rendu !== null && "ligne" in rendu ? /** @type {{ ligne: string, detail?: string }} */ (rendu) : { ligne: String(rendu), detail: "" };
      poser(project, { etape: "refus", ligne: refusal.ligne, detail: refusal.detail ?? "" });
    },
    // « not now » : la question part, et ne revient pas tant que l'app tourne.
    /** @param {string} project */
    ecarter(project) {
      ecartes.add(project);
      poser(project, undefined);
    },
    // Servi, la confirmation lue : elle part.
    /** @param {string} project */
    fermer(project) {
      if (tenues.has(project)) poser(project, undefined);
    },
  };
}

/** @param {Fabrique} doc @param {string} balise @param {string} classe @param {string} [texte] */
function cree(doc, balise, classe, texte) {
  const element = doc.createElement(balise);
  if (classe !== "") element.className = classe;
  if (texte !== undefined) element.textContent = texte;
  return element;
}

/** @param {Fabrique} doc @param {any[]} boutons */
function actions(doc, boutons) {
  const rangee = cree(doc, "div", "gestes");
  rangee.append(...boutons);
  return rangee;
}

// La question, au-dessus du rail : ce qui est attendu, pourquoi en une phrase, un bouton par machine — cet ordinateur en
// tête —, et « not now ». Servi : une phrase, et « close ». `etat` n'est jamais `a-juger` ici : rien ne se pose encore.
/** @param {Fabrique} doc @param {{ depot: string, etat: Exclude<State, { etape: "a-juger" }>, choix: readonly Choice[] }} donnees @param {Actions} action */
export function poserLaRequestDeStation(doc, { depot: repository, etat: state, choix: choice }, action) {
  const racine = cree(doc, "section", "installation-projet carte");
  racine.ariaLabel = QUESTION(repository);
  racine.dataset.etape = state.etape;
  if (state.etape === "servi") {
    const dit = state.absente ? AU_RETOUR(state.nom, repository) : state.ici ? SERVED_ICI(repository) : SERVED_PAR(state.nom, repository);
    racine.append(cree(doc, "p", "phrase", dit), actions(doc, [buttonAction(doc, FERMER, action.fermer)]));
    return racine;
  }
  const enCours = state.etape === "enCours" ? state.cle : undefined;
  const refusal = state.etape === "refus" ? { ligne: state.ligne, detail: state.detail } : undefined;
  const plusTard = buttonAction(doc, PLUS_TARD, action.ecarter, { sorte: "discret" });
  const button = plusTard.children?.[0];
  if (button !== undefined) button.disabled = enCours !== undefined;
  // Les machines, puis « not now » sur la même ligne ; un refus, dessous.
  const [liste, ...dessous] = poserLesChoice(doc, { choix: choice, ...(enCours === undefined ? {} : { enCours }), ...(refusal === undefined ? {} : { refus: refusal }) }, action.choisir);
  racine.append(cree(doc, "h2", "attendu", QUESTION(repository)), cree(doc, "p", "phrase", PERSONNE(repository)), actions(doc, [liste, plusTard]), ...dessous);
  return racine;
}
