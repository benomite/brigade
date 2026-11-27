// @ts-check
// Les tickets récurrents du projet sous Settings (ticket 3231, épique 3216) : ceux que sa cuisine tient (`recurring`,
// runtime/src/recurrents/, ticket 3230), une rangée chacun — son titre, son rythme en mots (« every week on Monday ») et la
// date de sa prochaine occurrence ; suspendu, il le dit (« paused ») et ne montre aucune date. Chaque rangée a deux gestes,
// d'un clic chacun, sans confirmation : « pause » ou « resume », et « remove ». La rangée change sur ce que le runtime
// rend ; refusé, le refus se dit en une ligne sur la rangée, et elle reste ce qu'elle était.
//
// Le service a ce contrat : `list()` rend les tickets récurrents ; `pause(id)` et `resume(id)` rendent le ticket changé ;
// `remove(id)` rend `{ retire: true }` ; chaque geste peut rendre un refus d'une ligne. Ce module ne touche pas
// `document` : il reçoit de quoi créer un élément (bricks.js), et le conteneur où se poser.

import { buttonAction, hover } from "../bricks.js";
import { lineError } from "../components/line-error/line-error.js";
import { lineEmpty } from "../components/line-empty/line-empty.js";
import { NOT_REACHED, NOT_STILL } from "../lexicon.js";

/** @typedef {import("../bricks.js").Fabrique} Fabrique */
/** @typedef {import("./recurring-box.ts").Recurring} Recurring */
/** @typedef {import("./recurring-box.ts").Pace} Pace */
/** @typedef {import("./recurring-box.ts").WritingOfARecurring} Rendered */
// `list` rend `undefined` quand le pont ne porte pas les tickets récurrents (un téléphone) : la section ne se pose pas ;
// `{ sans }` quand ils ne se lisent pas : la section le dit en une ligne.
/** @typedef {{ list(): Promise<Recurring[] | { sans: string, detail?: string } | undefined>, pause(id: string): Promise<Rendered>, resume(id: string): Promise<Rendered>, remove(id: string): Promise<Rendered> }} Service */
// Une rangée : le ticket récurrent, le geste en route, et le refus du dernier.
/** @typedef {{ recurrent: Recurring, enCours?: boolean, refus?: { ligne: string, detail: string } }} Row */
/** @typedef {{ lecture: "en-cours" } | { lecture: "sans" } | { lecture: "refus", ligne: string, detail: string } | { lecture: "lue", rangees: Row[] }} State */

export const TITLE = "recurring tickets";
export const WORDS = {
  aide: "Tickets that come back on a rhythm: on its next date, each one becomes an issue and lands on the rail like any ticket. A paused one creates nothing.",
  vide: NOT_STILL("recurring tickets"),
  indisponible: NOT_REACHED("recurring tickets"),
  pause: "pause",
  resume: "resume",
  retirer: "remove",
  suspendu: "paused",
  prochaine: "next",
  rienEnvoye: "nothing was changed: no answer from the service",
};

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// Le rang d'un jour du mois en anglais : 1st, 2nd, 3rd, 4th… 11th, 12th, 13th… 21st, 22nd, 23rd… 31st.
/** @param {number} day */
export function rank(day) {
  const ten = day % 100;
  if (ten >= 11 && ten <= 13) return `${day}th`;
  return `${day}${{ 1: "st", 2: "nd", 3: "rd" }[day % 10] ?? "th"}`;
}

// Le rythme en mots : « every day », « every week on Monday », « every month on the 15th ».
/** @param {Pace} pace */
export function paceEnWords(pace) {
  if (pace.kind === "weekly") return `every week on ${DAYS[pace.weekday - 1] ?? "?"}`;
  if (pace.kind === "monthly") return `every month on the ${rank(pace.dayOfMonth)}`;
  return "every day";
}

// La date d'une occurrence, un jour UTC `YYYY-MM-DD` : « Mon, Oct 19 » — l'année en plus quand ce n'est pas celle d'aujourd'hui.
/** @param {string} day @param {number} [now] */
export function dateEnWords(day, now = Date.now()) {
  const date = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return day;
  const otherYear = date.getUTCFullYear() !== new Date(now).getUTCFullYear();
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", ...(otherYear ? { year: "numeric" } : {}), timeZone: "UTC" });
}

/** @param {Fabrique} doc @param {string} balise @param {string} [text] */
function created(doc, balise, text) {
  const pose = doc.createElement(balise);
  if (text !== undefined) pose.textContent = text;
  return pose;
}

// Une rangée : le titre ; son rythme en mots et sa prochaine date — ou « paused » ; « pause » ou « resume », et « remove ».
// Dessous, le refus du dernier geste, en une ligne.
/**
 * @param {Fabrique} doc
 * @param {{ rangee: Row, gestes: { basculer: (row: Row) => void, retirer: (row: Row) => void } }} options
 */
export function setOneRecurring(doc, { rangee: row, gestes: actions }) {
  const { recurrent: recurringOne } = row;
  const root = created(doc, "div");
  root.className = recurringOne.paused ? "recurrent suspendu" : "recurrent";
  root.dataset.id = recurringOne.id;

  const title = created(doc, "strong", recurringOne.title);
  title.className = "titre";
  title.title = recurringOne.title;

  const when = created(doc, "span");
  when.className = "quand";
  const pace = created(doc, "span", paceEnWords(recurringOne.rhythm));
  pace.className = "rythme";
  when.append(pace);
  if (recurringOne.paused) {
    const suspended = created(doc, "span", WORDS.suspendu);
    suspended.className = "etat-suspendu";
    when.append(suspended);
  } else {
    const nextOne = created(doc, "span", `${WORDS.prochaine} ${dateEnWords(recurringOne.nextDate)}`);
    nextOne.className = "prochaine";
    nextOne.dataset.date = recurringOne.nextDate;
    when.append(nextOne);
  }

  const busy = row.enCours === true;
  const actionToggle = buttonAction(doc, recurringOne.paused ? WORDS.resume : WORDS.pause, () => actions.basculer(row));
  actionToggle.className = recurringOne.paused ? "action reprendre" : "action suspendre";
  const actionRemoval = buttonAction(doc, WORDS.retirer, () => actions.retirer(row), { sorte: "danger" });
  actionRemoval.className = "action retirer";
  for (const [group, name] of /** @type {const} */ ([
    [actionToggle, `${recurringOne.paused ? WORDS.resume : WORDS.pause} ${recurringOne.title}`],
    [actionRemoval, `${WORDS.retirer} ${recurringOne.title}`],
  ])) {
    /** @type {any} */
    const button = group.children[0];
    if (button !== undefined) {
      button.disabled = busy;
      button.ariaLabel = name;
    }
  }
  const control = created(doc, "span");
  control.className = "controle";
  control.append(actionToggle, actionRemoval);

  root.append(title, when, control);
  if (row.refus !== undefined) root.append(lineError(doc, row.refus.ligne, row.refus.detail));
  return root;
}

// La section : son titre et son aide au survol ; puis une rangée par ticket récurrent — ou, sans aucun, la ligne vide.
// Null tant que rien n'est à poser.
/**
 * @param {Fabrique} doc
 * @param {{ etat: State, gestes: { basculer: (row: Row) => void, retirer: (row: Row) => void } }} options
 */
export function setTheRecurring(doc, { etat: state, gestes: actions }) {
  if (state.lecture === "sans" || state.lecture === "en-cours") return null;
  const section = created(doc, "section");
  section.className = "recurrents-du-projet";
  section.ariaLabel = "The project's recurring tickets";
  const head = created(doc, "div");
  head.className = "tete";
  const title = created(doc, "span", TITLE);
  title.className = "nom";
  title.append(hover(doc, WORDS.aide));
  head.append(title);
  section.append(head);
  if (state.lecture === "refus") section.append(lineError(doc, state.ligne, state.detail));
  else if (state.rangees.length === 0) section.append(lineEmpty(doc, WORDS.vide, { classe: "aucun" }));
  else section.append(...state.rangees.map((row) => setOneRecurring(doc, { rangee: row, gestes: actions })));
  return section;
}

/** @param {unknown} error */
const message = (error) => (error instanceof Error ? error.message : String(error));

// Ce qu'un geste a rendu, lu : le ticket changé, son retrait, ou un refus — toute autre réponse est un refus, jamais un
// changement deviné.
/** @param {unknown} rendered @returns {{ recurrent: Recurring } | { retire: true } | { refus: string, detail: string }} */
export function renderedRead(rendered) {
  if (typeof rendered === "object" && rendered !== null) {
    const { recurrent: recurringOne, retire: removed, refus: refusal, detail } = /** @type {Record<string, any>} */ (rendered);
    if (removed === true) return { retire: true };
    if (typeof recurringOne === "object" && recurringOne !== null && typeof recurringOne.id === "string" && typeof recurringOne.paused === "boolean") return { recurrent: recurringOne };
    if (typeof refusal === "string" && refusal.trim() !== "") {
      const [line = "", ...remains] = refusal.trim().split("\n");
      return { refus: line.trim(), detail: [...remains, typeof detail === "string" ? detail : ""].join("\n").trim() };
    }
  }
  return { refus: WORDS.rienEnvoye, detail: rendered === undefined ? "" : JSON.stringify(rendered) };
}

// Monte la section dans son conteneur, pour un projet : lit les tickets récurrents, les pose, et répond aux gestes. Le
// conteneur retient le projet qu'il montre : une réponse qui arrive pour un autre, quitté depuis, ne s'y pose pas.
/**
 * @param {Fabrique} doc
 * @param {any} container
 * @param {{ projet: string, service: Service }} options
 */
export async function mountTheRecurring(doc, container, { projet: project, service }) {
  container.dataset.projet = project;
  /** @type {State} */
  let state = { lecture: "en-cours" };
  const set = () => {
    if (container.dataset.projet !== project) return;
    const pose = setTheRecurring(doc, { etat: state, gestes: actions });
    container.hidden = pose === null;
    container.replaceChildren(...(pose === null ? [] : [pose]));
  };

  /** @param {Row} row @param {() => Promise<Rendered>} play */
  async function play(row, play) {
    if (row.enCours === true) return;
    row.enCours = true;
    row.refus = undefined;
    set();
    /** @type {unknown} */
    let received;
    try {
      received = await play();
    } catch (error) {
      received = { refus: WORDS.rienEnvoye, detail: message(error) };
    }
    const readOne = renderedRead(received);
    row.enCours = false;
    if ("retire" in readOne) {
      if (state.lecture === "lue") state = { lecture: "lue", rangees: state.rangees.filter((other) => other !== row) };
    } else if ("recurrent" in readOne) row.recurrent = readOne.recurrent;
    else row.refus = { ligne: readOne.refus, detail: readOne.detail };
    set();
  }

  const actions = {
    /** @param {Row} row */
    basculer: (row) => void play(row, () => (row.recurrent.paused ? service.resume(row.recurrent.id) : service.pause(row.recurrent.id))),
    /** @param {Row} row */
    retirer: (row) => void play(row, () => service.remove(row.recurrent.id)),
  };

  set();
  try {
    const recurring = await service.list();
    if (recurring === undefined) state = { lecture: "sans" };
    else if (!Array.isArray(recurring)) state = { lecture: "refus", ligne: typeof recurring?.sans === "string" ? recurring.sans : WORDS.indisponible, detail: recurring?.detail ?? JSON.stringify(recurring) };
    else state = { lecture: "lue", rangees: recurring.map((recurringOne) => ({ recurrent: recurringOne })) };
  } catch (error) {
    state = { lecture: "refus", ligne: WORDS.indisponible, detail: message(error) };
  }
  set();
}

// Le service tel que le pont le porte : chaque méthode, si le pont l'a ; sans elle, la lecture ne rend rien — la section
// ne se pose pas — et un geste le dit en refus.
/**
 * @param {Partial<Pick<import("../bridge.d.ts").Bridge, "listerLesRecurrents" | "changerUnRecurrent">>} bridge
 * @param {string} project
 * @returns {Service}
 */
export function serviceOfRecurring(bridge, project) {
  /** @param {"pause" | "resume" | "remove"} action @returns {(id: string) => Promise<Rendered>} */
  const change = (action) => async (id) => (typeof bridge.changerUnRecurrent === "function" ? bridge.changerUnRecurrent(project, action, id) : { refus: WORDS.rienEnvoye });
  return {
    list: async () => (typeof bridge.listerLesRecurrents === "function" ? bridge.listerLesRecurrents(project) : undefined),
    pause: change("pause"),
    resume: change("resume"),
    remove: change("remove"),
  };
}
