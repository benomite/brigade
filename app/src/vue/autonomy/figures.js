// @ts-check
// Les chiffres d'autonomie (ticket 3222, épique 3213) : le but de brigade est l'autonomie, et trois chiffres disent si
// elle tient — servi sans humain, délai, taux de renvoi —, sur les 7 ou les 30 derniers jours, au choix. D'un projet, dans
// sa section de Settings ; de tous les projets ensemble, sur la page de leur coût. Un clic sur « served with a human »
// déplie les tickets qui ont demandé quelque chose au chef, chacun avec sa question et son lien : chacun est un échec à
// corriger (CLAUDE.md, « Brigade's goal: autonomy »). À côté, ce que la pass a laissé passer sur ces mêmes tickets (ticket 3515) :
// les bugs échappés et les reverts, chacun avec ce qui fait son nombre — les tickets, les commits.
//
// La vue n'y calcule rien : la lecture vient de GitHub, par le process principal (autonomy-github.ts), et le calcul est
// celui du runtime. Le bloc garde ce qu'il a lu de chaque période dix minutes ; une période changée se lit si elle ne
// l'a pas été. Ce module ne touche pas `document` : il reçoit de quoi créer un élément (bricks.js).

import { hover } from "../bricks.js";
import { button } from "../components/button/button.js";
import { lineError } from "../components/line-error/line-error.js";
import { lineEmpty } from "../components/line-empty/line-empty.js";
import { READ_OF, NOT_REACHED } from "../lexicon.js";
import { durationInClear } from "../project/delay.js";

/** @typedef {import("../bricks.js").Fabrique} Fabrique */
/** @typedef {import("./autonomy-github.ts").ReadOfAutonomy} Reading */
/** @typedef {Extract<Reading, { chiffres: unknown }>["chiffres"]} Figures */

export const TITLE = "Autonomy";
// Les périodes offertes, en jours (compute.ts, `PERIODES`) — le test les compare.
export const PERIODS = /** @type {const} */ ([7, 30]);
/** @param {number} days */
export const periodSaid = (days) => `last ${days} days`;
export const WITHOUT_HUMAN = "served without a human";
export const WITH_HUMAN = "served with a human";
export const DELAY = "lead time";
export const SEND_BACK = "send-back rate";
const BUGS_ESCAPED = "escaped bugs";
const REVERTS = "reverts";
export const DEFINITIONS = {
  sansHumain: "The share of the tickets merged in the period whose path from fire to merge never asked the chef anything: no TODO card, never parked for the chef.",
  delai: "The median time from fire to merge of the tickets merged in the period.",
  renvoi: "The share of the deliveries merged in the period that the pass sent back at least once.",
  bugs: "The bug-labelled issues created after a ticket merged in the period was served, and citing its number in their title or body.",
  reverts: "The commits of the default branch carrying git's 'This reverts commit <sha>' trailer whose reverted commit belongs to a ticket merged in the period.",
};
export const SOURCE = "Read from GitHub only: the merged pull requests, the labels and comments of each ticket, the bug-labelled issues and the reverting commits of the default branch.";
const DEFAULTS_NOT_READ = "not read";
/** @param {string} sha */
const SHA_COURT = (sha) => sha.slice(0, 7);
/** @param {number} days */
export const NO = (days) => `no ticket merged in the ${periodSaid(days)}`;
export const WITHOUT_QUESTION = "question not written on the ticket";
/** @param {number} days @param {{ projet: string, depuis: string }[]} partial */
export const PARTIAL = (days, partial) =>
  `not read over the whole ${periodSaid(days)}: ${partial.map(({ projet: project, depuis: since }) => `${project} counted only from ${since.slice(0, 16).replace("T", " ")} UTC`).join(", ")}`;
export const FRESHNESS_MS = 10 * 60_000;

export const WITHOUT_READ = NOT_REACHED("autonomy figures");
/** @param {number} days @param {string} detail @returns {Reading} */
const without = (days, detail) => ({ jours: days, sans: WITHOUT_READ, detail });

/** @param {number} part */
const percent = (part) => `${Math.round(part * 100)} %`;

// Le bloc, son état, et `poser()` qui le rend à jour — et lit la période choisie si elle ne l'a pas été depuis dix minutes.
// `lire` : la lecture des chiffres de la période ; `ouvrir` : l'issue d'un ticket, dans le navigateur ; `tous` : le bloc de
// tous les projets nomme le projet de chaque ticket.
/**
 * @param {Fabrique} doc
 * @param {{ lire: (days: number) => Promise<Reading>, ouvrir: (url: string) => void, tous?: boolean, maintenant?: () => number }} options
 */
export function holdTheFiguresOfAutonomy(doc, { lire: read, ouvrir: open, tous: all = false, maintenant: now = Date.now }) {
  const element = doc.createElement("section");
  element.className = "chiffres-autonomie";
  element.ariaLabel = all ? `${TITLE} of all projects` : TITLE;
  element.dataset.bloc = "chiffres-autonomie";
  /** @type {number} */
  let days = PERIODS[0];
  let opened = false;
  /** @type {Map<number, { le: number, lecture: Reading | null }>} */
  const readEntries = new Map();

  /** @param {number} period */
  const readPeriod = (period) => {
    readEntries.set(period, { le: now(), lecture: readEntries.get(period)?.lecture ?? null });
    void Promise.resolve()
      .then(() => read(period))
      .then(
        (readEntry) => (typeof readEntry === "object" && readEntry !== null && ("sans" in readEntry || "chiffres" in readEntry) ? readEntry : without(period, "the app gave no figures")),
        (/** @type {unknown} */ error) => without(period, error instanceof Error ? error.message : String(error)),
      )
      .then((reading) => {
        readEntries.set(period, { le: readEntries.get(period)?.le ?? now(), lecture: reading });
        render();
      });
  };

  const render = () => {
    const head = doc.createElement("div");
    head.className = "tete";
    const title = doc.createElement("h3");
    title.textContent = TITLE;
    title.append(hover(doc, SOURCE));
    const periods = doc.createElement("div");
    periods.className = "periodes";
    periods.role = "group";
    periods.ariaLabel = "period";
    for (const period of PERIODS) {
      const choice = button(doc, periodSaid(period), () => choose(period), { sorte: "discret" });
      choice.ariaPressed = String(period === days);
      periods.append(choice);
    }
    head.append(title, periods);
    element.replaceChildren(head, body());
  };

  const body = () => {
    const reading = readEntries.get(days)?.lecture ?? null;
    if (reading === null) return lineEmpty(doc, READ_OF("GitHub"), { classe: "lecture" });
    if ("sans" in reading) return lineError(doc, reading.sans, reading.detail);
    const { chiffres: theFigures, manquants: missing, partiels: partial } = reading;
    const content = doc.createElement("div");
    content.className = "corps";
    // Des chiffres sur une période lue en partie le disent avant tout, avec la part qu'ils couvrent.
    if (partial.length > 0) {
      content.append(lineError(doc, PARTIAL(days, partial), partial.map(({ projet: project, raison: reason }) => `${project}: ${reason}`).join("\n"), { classe: "partiels" }));
    }
    if (theFigures.tickets === 0) content.append(lineEmpty(doc, NO(days)));
    else content.append(figures(theFigures));
    if (missing.length > 0) {
      content.append(lineError(doc, `not read: ${missing.map(({ projet: project }) => project).join(", ")}`, missing.map(({ projet: project, raison: reason }) => `${project}: ${reason}`).join("\n"), { classe: "manquants" }));
    }
    if (opened && theFigures.avecHumain.length > 0) content.append(list(theFigures));
    return content;
  };

  /** @param {Figures} theFigures */
  const figures = (theFigures) => {
    const grid = doc.createElement("div");
    grid.className = "figures";
    const withIt = theFigures.avecHumain.length;
    const withoutHuman = figure(WITHOUT_HUMAN, DEFINITIONS.sansHumain, percent(theFigures.partSansHumain ?? 0), `${theFigures.sansHumain} of ${theFigures.tickets} merged tickets`);
    if (withIt > 0) {
      const unfold = button(doc, `${WITH_HUMAN} · ${withIt}`, () => toggle());
      unfold.className = "avec-humain";
      unfold.ariaExpanded = String(opened);
      withoutHuman.append(unfold);
    }
    grid.append(
      withoutHuman,
      figure(DELAY, DEFINITIONS.delai, durationInClear(theFigures.delaiMedianMs ?? 0), "median, fire to merge"),
      figure(SEND_BACK, DEFINITIONS.renvoi, percent(theFigures.partRenvoyee ?? 0), `${theFigures.renvoyes} of ${theFigures.tickets} deliveries sent back`),
      defaults(BUGS_ESCAPED, DEFINITIONS.bugs, theFigures.bugsEchappes, theFigures.defautsNonLus, (bug) => `${named(bug.projet)}${bug.tickets.map((ticket) => `#${ticket}`).join(", ")} (bug #${bug.bug})`),
      defaults(REVERTS, DEFINITIONS.reverts, theFigures.reverts, theFigures.defautsNonLus, (revert) => `${named(revert.projet)}${SHA_COURT(revert.sha)} (${revert.tickets.map((ticket) => `#${ticket}`).join(", ")})`),
    );
    return grid;
  };

  /** @param {string} project */
  const named = (project) => (all ? `${project} ` : "");

  // Un nombre de défauts, et sous lui ce qui le fait ; non lus, ni nombre ni zéro : pourquoi, au survol.
  /**
   * @template {{ projet: string }} T
   * @param {string} name @param {string} definition @param {T[] | null} readOnes @param {Figures["defautsNonLus"]} notRead @param {(oneOf: T) => string} tell
   */
  const defaults = (name, definition, readOnes, notRead, tell) => {
    const frame =
      readOnes === null
        ? figure(name, definition, DEFAULTS_NOT_READ, notRead.map(({ projet: project, raison: reason }) => `${project}: ${reason}`).join("\n"))
        : figure(name, definition, String(readOnes.length), readOnes.length === 0 ? "none" : readOnes.map(tell).join(" · "));
    frame.classList.add("defauts");
    return frame;
  };

  /** @param {string} name @param {string} definition @param {string} value @param {string} said */
  const figure = (name, definition, value, said) => {
    const frame = doc.createElement("div");
    frame.className = "figure";
    const title = doc.createElement("h4");
    title.textContent = name;
    title.append(hover(doc, definition));
    const total = doc.createElement("p");
    total.className = "valeur";
    total.textContent = value;
    const under = doc.createElement("p");
    under.className = "dit";
    under.textContent = said;
    frame.append(title, total, under);
    return frame;
  };

  /** @param {Figures} theFigures */
  const list = (theFigures) => {
    const ul = doc.createElement("ul");
    ul.className = "avec-humain";
    ul.ariaLabel = `${WITH_HUMAN}, ${periodSaid(days)}`;
    for (const served of theFigures.avecHumain) {
      const li = doc.createElement("li");
      const link = button(doc, `${all ? `${served.projet} ` : ""}#${served.ticket} ${served.titre}`, () => open(served.url), { sorte: "discret", coupe: true });
      link.className = "ticket";
      li.append(link);
      for (const question of served.questions) {
        const line = doc.createElement("p");
        line.className = question === null ? "question sans" : "question";
        line.textContent = question ?? WITHOUT_QUESTION;
        li.append(line);
      }
      ul.append(li);
    }
    return ul;
  };

  /** @param {number} period */
  const choose = (period) => {
    days = period;
    set();
  };
  const toggle = () => {
    opened = !opened;
    render();
  };

  const set = () => {
    const readEntry = readEntries.get(days);
    if (readEntry === undefined || now() - readEntry.le >= FRESHNESS_MS) readPeriod(days);
    render();
    return element;
  };

  return { element, poser: set };
}
