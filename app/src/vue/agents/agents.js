// @ts-check
// The Agents tab of a project's view (ticket 4224, rebuilt by 4569 for the new kitchen), beside Rail, Stations and Settings: one
// line per agent at work — its kind (cook, pass, manager, supervisor), its ticket, since when, and on which station — read
// from GitHub and from what the kitchen writes on its station (agents/source.js). With none at work, one line says
// `No agent at work`; a station that cannot be read says why in one sentence beneath; a reading that fails says the agents
// were not reached, its detail on hover. Nothing is made up in place of a reading.
// This module does not touch `document`: it receives what creates an element (bricks.js).

import { lineError } from "../components/line-error/line-error.js";
import { lineEmpty } from "../components/line-empty/line-empty.js";
import { READING, NOT_REACHED } from "../lexicon.js";
import { duration } from "../activity-of-cook.js";
import { source } from "./source.js";

/** @typedef {import("../bricks.js").Fabrique} Fabrique */
/** @typedef {import("./source.js").AgentAtWork} AgentAtWork */

const TITLE = "The agents";
export const NO_AGENT = "No agent at work";
const UNREADABLE = "The agents' reading is not readable";

/** @param {unknown} readOne @returns {readOne is import("./source.js").AgentsAtWork} */
const isReading = (readOne) => {
  const { agents, stations } = /** @type {any} */ (readOne) ?? {};
  return (
    Array.isArray(agents) &&
    agents.every((one) => typeof one?.agent === "string" && (one.ticket === null || typeof one.ticket === "number") && (one.since === null || typeof one.since === "string") && (one.station === null || typeof one.station === "string")) &&
    Array.isArray(stations) &&
    stations.every((one) => typeof one?.station === "string" && typeof one.why === "string")
  );
};

/** @param {Error | unknown} error */
const detailOf = (error) => (error instanceof Error ? error.message : String(error));

// What one agent at work says, in words: `cook · 4569 · since 12 min · on box`.
/** @param {AgentAtWork} one @param {number} now */
export const lineOf = ({ agent, ticket, since, station }, now) => {
  const started = since === null ? Number.NaN : Date.parse(since);
  return [agent, ...(ticket === null ? [] : [`#${ticket}`]), ...(Number.isNaN(started) ? [] : [`since ${duration(Math.max(0, now - started))}`]), ...(station === null ? [] : [`on ${station}`])].join(" · ");
};

// The tab, laid in `element`. `lire(project)` reads the agents again; `montrer(project)` reads them only for another project than the one read.
/** @param {Fabrique} doc @param {{ maintenant?: () => number }} [options] */
export function holdTheAgents(doc, { maintenant: now = Date.now } = {}) {
  const element = doc.createElement("section");
  element.className = "agents";
  element.ariaLabel = TITLE;
  /** @type {string | undefined} */
  let project;
  /** @type {import("./source.js").AgentsAtWork | { ligne: string, detail: string } | null} */
  let state = null;
  let request = 0;

  const render = () => {
    if (state === null) return void element.replaceChildren(lineEmpty(doc, READING));
    if ("ligne" in state) return void element.replaceChildren(lineError(doc, state.ligne, state.detail));
    const lines = state.agents.map((one) => {
      const line = doc.createElement("li");
      line.className = "agent-au-travail";
      line.dataset.agent = one.agent;
      line.textContent = lineOf(one, now());
      return line;
    });
    const list = doc.createElement("ul");
    list.append(...lines);
    const troubles = state.stations.map(({ why }) => lineEmpty(doc, why, { classe: "station-illisible" }));
    element.replaceChildren(...(lines.length === 0 ? [lineEmpty(doc, NO_AGENT)] : [list]), ...troubles);
  };

  /** @param {string} name */
  const read = (name) => {
    project = name;
    const the = ++request;
    void Promise.resolve()
      .then(() => source.lire(name))
      .then(
        (readOne) => {
          if (the !== request) return;
          state = isReading(readOne) ? readOne : { ligne: UNREADABLE, detail: JSON.stringify(readOne ?? null).slice(0, 400) };
          render();
        },
        (/** @type {unknown} */ error) => {
          if (the !== request) return;
          state = { ligne: NOT_REACHED("the agents"), detail: detailOf(error) };
          render();
        },
      );
  };

  /** @param {string} name */
  const show = (name) => {
    if (name !== project) read(name);
  };

  render();
  return { element, lire: read, montrer: show };
}
