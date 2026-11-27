// @ts-check
// Le premier écran d'un projet qu'« Add a project » vient d'ouvrir, quand il a des issues ouvertes (ticket 3268) : « Brigade
// read your N open issues — here are the ones to cook first ». Les lignes sont celles que le second propose (departure-of-project.ts,
// son triage) : l'issue, une priorité, une raison en une ligne. Le chef change la priorité d'une ligne, en lâche une, puis un
// seul bouton met les lignes restantes sur le rail, avec les priorités montrées. Un projet sans issue ouverte n'a pas cet écran :
// il va droit à la question suivante du parcours.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (bricks.js), et rend des éléments.

import { buttonAction, hover } from "../bricks.js";
import { lineError } from "../components/line-error/line-error.js";
import { actions } from "../journey-project/connection.js";
import { RETRY } from "../lexicon.js";

/** @typedef {import("../bricks.js").Fabrique} Fabrique */
/** @typedef {{ ticket: number, titre: string, priorite: number, raison: string }} Line */
// Où en est le départ : le second lit les issues (`lecture`) ; ses propositions (`propose`) ; ce qui n'a pas pu se lire
// (`sans`) ; la mise sur le rail en cours (`mise`) ; une mise dont des lignes ont été refusées (`refus`, ces lignes restent).
/** @typedef {{ phase: "lecture" } | { phase: "propose", ouvertes: number, lignes: Line[] } | { phase: "sans", sans: string, detail?: string } | { phase: "mise", ouvertes: number, lignes: Line[] } | { phase: "refus", ouvertes: number, lignes: Line[], refus: { ticket: number, refus: string, detail: string }[] }} State */

// Les priorités que le second donne, `prio:1` à `prio:3`.
export const PRIORITIES = [1, 2, 3];
/** @param {number} openEntries */
export const TITLE = (openEntries) => `Brigade read your ${openEntries} open issue${openEntries === 1 ? "" : "s"} — here are the ones to cook first`;
export const READING = "Brigade is reading your open issues. Nothing is awaited from you.";
export const PUT = "put them on the rail";
export const PASS = "not now";
export const CONTINUE = "continue";
export const RELEASE = "drop";
export const NOTHING_A_PUT = "Every line was dropped: nothing will be put on the rail.";
export const PUTTING_IN_PROGRESS = "Putting them on the rail…";
/** @param {string} without */
export const WITHOUT = (without) => `${without.replace(/\.$/, "")}. Waiting for you to try again, or to go on without.`;

/** @param {Fabrique} doc @param {string} balise @param {string} [text] */
function created(doc, balise, text) {
  const pose = doc.createElement(balise);
  if (text !== undefined) pose.textContent = text;
  return pose;
}

/** @param {Fabrique} doc @param {Line} line @param {boolean} frozen @param {{ changer: (ticket: number, priority: number) => void, lacher: (ticket: number) => void }} action */
function oneLine(doc, line, frozen, action) {
  const item = created(doc, "li");
  item.className = "ligne-de-depart";
  item.dataset.ticket = String(line.ticket);
  const title = created(doc, "span", `#${line.ticket} ${line.titre}`);
  title.className = "titre";
  const choice = created(doc, "select");
  choice.ariaLabel = `Priority of #${line.ticket}`;
  choice.append(
    ...PRIORITIES.map((priority) => {
      const option = created(doc, "option", `prio:${priority}`);
      option.value = String(priority);
      option.selected = priority === line.priorite;
      return option;
    }),
  );
  choice.value = String(line.priorite);
  choice.disabled = frozen;
  choice.addEventListener("change", () => action.changer(line.ticket, Number(choice.value)));
  const reason = created(doc, "span", line.raison);
  reason.className = "raison";
  item.append(title, choice, reason);
  if (!frozen) item.append(buttonAction(doc, RELEASE, () => action.lacher(line.ticket), { sorte: "discret" }));
  return item;
}

// L'écran : le titre, les lignes, le bouton. `refus` : les lignes que la dernière mise a refusées, une phrase chacune.
/**
 * @param {Fabrique} doc
 * @param {{ depot: string, etat: State }} donnees
 * @param {{ changer: (ticket: number, priority: number) => void, lacher: (ticket: number) => void, mettre: () => void, passer: () => void, relire: () => void }} action
 */
export function setTheDeparture(doc, { depot: repository, etat: state }, action) {
  const root = created(doc, "section");
  root.className = "parcours-premier-projet depart-du-projet carte";
  root.dataset.etape = "depart";
  root.dataset.phase = state.phase;
  if (state.phase === "lecture") {
    root.ariaLabel = `${repository}: its open issues`;
    const said = created(doc, "p", READING);
    said.className = "phrase";
    root.append(said);
    return root;
  }
  if (state.phase === "sans") {
    root.ariaLabel = `${repository}: its open issues`;
    const said = created(doc, "p", WITHOUT(state.sans));
    said.className = "phrase";
    if ((state.detail ?? "").trim() !== "") said.append(hover(doc, state.detail ?? ""));
    root.append(said, actions(doc, [buttonAction(doc, RETRY, action.relire, { recommande: true }), buttonAction(doc, PASS, action.passer)]));
    return root;
  }
  const title = created(doc, "h2", TITLE(state.ouvertes));
  title.className = "attendu";
  root.ariaLabel = TITLE(state.ouvertes);
  const frozen = state.phase === "mise";
  const list = created(doc, "ul");
  list.className = "lignes-de-depart";
  list.append(...state.lignes.map((line) => oneLine(doc, line, frozen, action)));
  root.append(title, list);
  if (state.phase === "refus") for (const { refus: refusal, detail } of state.refus) root.append(lineError(doc, refusal, detail, { classe: "erreur" }));
  if (frozen) {
    const said = created(doc, "p", PUTTING_IN_PROGRESS);
    said.className = "phrase";
    root.append(said);
  } else if (state.lignes.length === 0) {
    const said = created(doc, "p", NOTHING_A_PUT);
    said.className = "phrase";
    root.append(said, actions(doc, [buttonAction(doc, CONTINUE, action.passer, { recommande: true })]));
  } else {
    root.append(actions(doc, [buttonAction(doc, PUT, action.mettre, { recommande: true }), buttonAction(doc, PASS, action.passer)]));
  }
  return root;
}

// Les départs tenus pour la vue, un par projet que « Add a project » a ouvert : tenus le temps que l'app tourne ; un projet
// sans départ (sans issue ouverte, passé ou mis sur le rail) n'en a pas, et la page va à la question suivante.
/** @param {{ rendre: (project: string) => void }} options */
export function holdTheDepartures({ rendre: render }) {
  /** @type {Map<string, State>} */
  const heldOnes = new Map();
  /** @param {string} project @param {State | undefined} state */
  const set = (project, state) => {
    if (state === undefined) heldOnes.delete(project);
    else heldOnes.set(project, state);
    render(project);
  };
  return {
    /** @param {string} project @returns {State | undefined} */
    de: (project) => heldOnes.get(project),
    /** @param {string} project */
    commencer: (project) => set(project, { phase: "lecture" }),
    // Ce que le second a proposé : sans issue ouverte, ou sans rien à proposer, le départ s'efface.
    /** @param {string} project @param {{ ouvertes: number, lignes: Line[] } | { aucune: true } | { sans: string, detail?: string }} departure */
    recu(project, departure) {
      if (heldOnes.get(project)?.phase !== "lecture") return;
      if ("aucune" in departure) return set(project, undefined);
      if ("sans" in departure) return set(project, { phase: "sans", sans: departure.sans, ...(departure.detail === undefined ? {} : { detail: departure.detail }) });
      set(project, departure.lignes.length === 0 ? undefined : { phase: "propose", ouvertes: departure.ouvertes, lignes: departure.lignes });
    },
    /** @param {string} project @param {number} ticket @param {number} priority */
    changer(project, ticket, priority) {
      const state = heldOnes.get(project);
      if (state === undefined || (state.phase !== "propose" && state.phase !== "refus")) return;
      set(project, { ...state, lignes: state.lignes.map((line) => (line.ticket === ticket ? { ...line, priorite: priority } : line)) });
    },
    /** @param {string} project @param {number} ticket */
    lacher(project, ticket) {
      const state = heldOnes.get(project);
      if (state === undefined || (state.phase !== "propose" && state.phase !== "refus")) return;
      const lines = state.lignes.filter((line) => line.ticket !== ticket);
      set(project, state.phase === "refus" ? { ...state, lignes: lines, refus: state.refus.filter((oneOf) => oneOf.ticket !== ticket) } : { ...state, lignes: lines });
    },
    // Les lignes à mettre sur le rail, telles que l'écran les montre ; la mise commence.
    /** @param {string} project @returns {{ ouvertes: number, lignes: Line[] } | undefined} */
    commencerLaMise(project) {
      const state = heldOnes.get(project);
      if (state === undefined || (state.phase !== "propose" && state.phase !== "refus") || state.lignes.length === 0) return undefined;
      const { ouvertes: openEntries, lignes: lines } = state;
      set(project, { phase: "mise", ouvertes: openEntries, lignes: lines });
      return { ouvertes: openEntries, lignes: lines };
    },
    // La mise est faite : ce qui est refusé reste à l'écran, avec sa cause ; sinon le départ s'efface.
    /** @param {string} project @param {number[]} done @param {{ ticket: number, refus: string, detail: string }[]} refusal */
    mise(project, done, refusal) {
      const state = heldOnes.get(project);
      if (state === undefined || state.phase !== "mise") return;
      const remain = state.lignes.filter(({ ticket }) => !done.includes(ticket));
      set(project, remain.length === 0 && refusal.length === 0 ? undefined : { phase: "refus", ouvertes: state.ouvertes, lignes: remain, refus: refusal.length === 0 ? [{ ticket: 0, refus: "some lines were not put on the rail", detail: "" }] : refusal });
    },
    // La mise n'a pas pu partir : les lignes reviennent, avec ce qui l'a empêchée.
    /** @param {string} project @param {string} refusal @param {string} detail */
    miseRatee(project, refusal, detail) {
      const state = heldOnes.get(project);
      if (state === undefined || state.phase !== "mise") return;
      set(project, { phase: "refus", ouvertes: state.ouvertes, lignes: state.lignes, refus: [{ ticket: 0, refus: refusal, detail }] });
    },
    /** @param {string} project */
    passer: (project) => set(project, undefined),
    /** @param {string} project */
    relire: (project) => set(project, { phase: "lecture" }),
  };
}
