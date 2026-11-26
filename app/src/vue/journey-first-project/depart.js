// @ts-check
// Le premier écran d'un projet qu'« Add a project » vient d'ouvrir, quand il a des issues ouvertes (ticket 3268) : « Brigade
// read your N open issues — here are the ones to cook first ». Les lignes sont celles que le second propose (depart-du-project.ts,
// son triage) : l'issue, une priorité, une raison en une ligne. Le chef change la priorité d'une ligne, en lâche une, puis un
// seul bouton met les lignes restantes sur le rail, avec les priorités montrées. Un projet sans issue ouverte n'a pas cet écran :
// il va droit à la question suivante du parcours.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js), et rend des éléments.

import { buttonAction, survol } from "../briques.js";
import { lineError } from "../composants/line-error/line-error.js";
import { actions } from "../journey-project/connection.js";
import { REESSAYER } from "../lexique.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {{ ticket: number, titre: string, priorite: number, raison: string }} Line */
// Où en est le départ : le second lit les issues (`lecture`) ; ses propositions (`propose`) ; ce qui n'a pas pu se lire
// (`sans`) ; la mise sur le rail en cours (`mise`) ; une mise dont des lignes ont été refusées (`refus`, ces lignes restent).
/** @typedef {{ phase: "lecture" } | { phase: "propose", ouvertes: number, lignes: Line[] } | { phase: "sans", sans: string, detail?: string } | { phase: "mise", ouvertes: number, lignes: Line[] } | { phase: "refus", ouvertes: number, lignes: Line[], refus: { ticket: number, refus: string, detail: string }[] }} State */

// Les priorités que le second donne, `prio:1` à `prio:3`.
export const PRIORITES = [1, 2, 3];
/** @param {number} ouvertes */
export const TITRE = (ouvertes) => `Brigade read your ${ouvertes} open issue${ouvertes === 1 ? "" : "s"} — here are the ones to cook first`;
export const READ = "Brigade is reading your open issues. Nothing is awaited from you.";
export const METTRE = "put them on the rail";
export const PASSER = "not now";
export const CONTINUER = "continue";
export const LACHER = "drop";
export const RIEN_A_METTRE = "Every line was dropped: nothing will be put on the rail.";
export const MISE_EN_COURS = "Putting them on the rail…";
/** @param {string} sans */
export const SANS = (sans) => `${sans.replace(/\.$/, "")}. Waiting for you to try again, or to go on without.`;

/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

/** @param {Fabrique} doc @param {Line} line @param {boolean} figee @param {{ changer: (ticket: number, priority: number) => void, lacher: (ticket: number) => void }} action */
function uneLine(doc, line, figee, action) {
  const item = cree(doc, "li");
  item.className = "ligne-de-depart";
  item.dataset.ticket = String(line.ticket);
  const titre = cree(doc, "span", `#${line.ticket} ${line.titre}`);
  titre.className = "titre";
  const choice = cree(doc, "select");
  choice.ariaLabel = `Priority of #${line.ticket}`;
  choice.append(
    ...PRIORITES.map((priority) => {
      const option = cree(doc, "option", `prio:${priority}`);
      option.value = String(priority);
      option.selected = priority === line.priorite;
      return option;
    }),
  );
  choice.value = String(line.priorite);
  choice.disabled = figee;
  choice.addEventListener("change", () => action.changer(line.ticket, Number(choice.value)));
  const raison = cree(doc, "span", line.raison);
  raison.className = "raison";
  item.append(titre, choice, raison);
  if (!figee) item.append(buttonAction(doc, LACHER, () => action.lacher(line.ticket), { sorte: "discret" }));
  return item;
}

// L'écran : le titre, les lignes, le bouton. `refus` : les lignes que la dernière mise a refusées, une phrase chacune.
/**
 * @param {Fabrique} doc
 * @param {{ depot: string, etat: State }} donnees
 * @param {{ changer: (ticket: number, priority: number) => void, lacher: (ticket: number) => void, mettre: () => void, passer: () => void, relire: () => void }} action
 */
export function poserLeDepart(doc, { depot: repository, etat: state }, action) {
  const racine = cree(doc, "section");
  racine.className = "parcours-premier-projet depart-du-projet carte";
  racine.dataset.etape = "depart";
  racine.dataset.phase = state.phase;
  if (state.phase === "lecture") {
    racine.ariaLabel = `${repository}: its open issues`;
    const dit = cree(doc, "p", READ);
    dit.className = "phrase";
    racine.append(dit);
    return racine;
  }
  if (state.phase === "sans") {
    racine.ariaLabel = `${repository}: its open issues`;
    const dit = cree(doc, "p", SANS(state.sans));
    dit.className = "phrase";
    if ((state.detail ?? "").trim() !== "") dit.append(survol(doc, state.detail ?? ""));
    racine.append(dit, actions(doc, [buttonAction(doc, REESSAYER, action.relire, { recommande: true }), buttonAction(doc, PASSER, action.passer)]));
    return racine;
  }
  const titre = cree(doc, "h2", TITRE(state.ouvertes));
  titre.className = "attendu";
  racine.ariaLabel = TITRE(state.ouvertes);
  const figee = state.phase === "mise";
  const liste = cree(doc, "ul");
  liste.className = "lignes-de-depart";
  liste.append(...state.lignes.map((line) => uneLine(doc, line, figee, action)));
  racine.append(titre, liste);
  if (state.phase === "refus") for (const { refus: refusal, detail } of state.refus) racine.append(lineError(doc, refusal, detail, { classe: "erreur" }));
  if (figee) {
    const dit = cree(doc, "p", MISE_EN_COURS);
    dit.className = "phrase";
    racine.append(dit);
  } else if (state.lignes.length === 0) {
    const dit = cree(doc, "p", RIEN_A_METTRE);
    dit.className = "phrase";
    racine.append(dit, actions(doc, [buttonAction(doc, CONTINUER, action.passer, { recommande: true })]));
  } else {
    racine.append(actions(doc, [buttonAction(doc, METTRE, action.mettre, { recommande: true }), buttonAction(doc, PASSER, action.passer)]));
  }
  return racine;
}

// Les départs tenus pour la vue, un par projet que « Add a project » a ouvert : tenus le temps que l'app tourne ; un projet
// sans départ (sans issue ouverte, passé ou mis sur le rail) n'en a pas, et la page va à la question suivante.
/** @param {{ rendre: (project: string) => void }} options */
export function holdLesDeparts({ rendre }) {
  /** @type {Map<string, State>} */
  const tenus = new Map();
  /** @param {string} project @param {State | undefined} state */
  const poser = (project, state) => {
    if (state === undefined) tenus.delete(project);
    else tenus.set(project, state);
    rendre(project);
  };
  return {
    /** @param {string} project @returns {State | undefined} */
    de: (project) => tenus.get(project),
    /** @param {string} project */
    commencer: (project) => poser(project, { phase: "lecture" }),
    // Ce que le second a proposé : sans issue ouverte, ou sans rien à proposer, le départ s'efface.
    /** @param {string} project @param {{ ouvertes: number, lignes: Line[] } | { aucune: true } | { sans: string, detail?: string }} depart */
    recu(project, depart) {
      if (tenus.get(project)?.phase !== "lecture") return;
      if ("aucune" in depart) return poser(project, undefined);
      if ("sans" in depart) return poser(project, { phase: "sans", sans: depart.sans, ...(depart.detail === undefined ? {} : { detail: depart.detail }) });
      poser(project, depart.lignes.length === 0 ? undefined : { phase: "propose", ouvertes: depart.ouvertes, lignes: depart.lignes });
    },
    /** @param {string} project @param {number} ticket @param {number} priority */
    changer(project, ticket, priority) {
      const state = tenus.get(project);
      if (state === undefined || (state.phase !== "propose" && state.phase !== "refus")) return;
      poser(project, { ...state, lignes: state.lignes.map((line) => (line.ticket === ticket ? { ...line, priorite: priority } : line)) });
    },
    /** @param {string} project @param {number} ticket */
    lacher(project, ticket) {
      const state = tenus.get(project);
      if (state === undefined || (state.phase !== "propose" && state.phase !== "refus")) return;
      const lines = state.lignes.filter((line) => line.ticket !== ticket);
      poser(project, state.phase === "refus" ? { ...state, lignes: lines, refus: state.refus.filter((un) => un.ticket !== ticket) } : { ...state, lignes: lines });
    },
    // Les lignes à mettre sur le rail, telles que l'écran les montre ; la mise commence.
    /** @param {string} project @returns {{ ouvertes: number, lignes: Line[] } | undefined} */
    commencerLaMise(project) {
      const state = tenus.get(project);
      if (state === undefined || (state.phase !== "propose" && state.phase !== "refus") || state.lignes.length === 0) return undefined;
      const { ouvertes, lignes: lines } = state;
      poser(project, { phase: "mise", ouvertes, lignes: lines });
      return { ouvertes, lignes: lines };
    },
    // La mise est faite : ce qui est refusé reste à l'écran, avec sa cause ; sinon le départ s'efface.
    /** @param {string} project @param {number[]} faites @param {{ ticket: number, refus: string, detail: string }[]} refusal */
    mise(project, faites, refusal) {
      const state = tenus.get(project);
      if (state === undefined || state.phase !== "mise") return;
      const restent = state.lignes.filter(({ ticket }) => !faites.includes(ticket));
      poser(project, restent.length === 0 && refusal.length === 0 ? undefined : { phase: "refus", ouvertes: state.ouvertes, lignes: restent, refus: refusal.length === 0 ? [{ ticket: 0, refus: "some lines were not put on the rail", detail: "" }] : refusal });
    },
    // La mise n'a pas pu partir : les lignes reviennent, avec ce qui l'a empêchée.
    /** @param {string} project @param {string} refusal @param {string} detail */
    miseRatee(project, refusal, detail) {
      const state = tenus.get(project);
      if (state === undefined || state.phase !== "mise") return;
      poser(project, { phase: "refus", ouvertes: state.ouvertes, lignes: state.lignes, refus: [{ ticket: 0, refus: refusal, detail }] });
    },
    /** @param {string} project */
    passer: (project) => poser(project, undefined),
    /** @param {string} project */
    relire: (project) => poser(project, { phase: "lecture" }),
  };
}
