// @ts-check
// The "Since you last looked" card (ticket 4649, epic 4647), at the top of the project view: what changed since the chef last
// opened this project, read from GitHub alone by the main process (since-last-looked.ts). Three groups — Merged, Sent back
// or reverted, Parked for you —, always all three, each heading counting everything ("Merged · 12"), each with its three
// latest tickets; an empty group says "nothing". An entry opens its issue.
// The card is read once per opening of the project, and stays while the project stays open: the rail's redraws pose the
// same card. The first opening of a project has no card — there is no last look to compare with.
// This module does not touch `document`: it receives what creates an element — the view gives its own, the tests a fake.

import { lineEmpty } from "../components/line-empty/line-empty.js";
import { lineError } from "../components/line-error/line-error.js";

/** @typedef {{ createElement(balise: string): any }} Fabrique */
/** @typedef {import("../../since-last-looked.ts").LookedGroup} Group */

const TITLE = "Since you last looked";
const NOTHING = "nothing";
const KEYS = ["merged", "sentBack", "parked"];
const PARTIAL = "GitHub gave more than the pages read: the counts stop there.";
/** @param {string} why */
const UNREAD = (why) => `What changed since you last looked was not read from GitHub: ${why}`;

/** @param {Fabrique} doc @param {string} balise @param {string} text */
const block = (doc, balise, text) => {
  const made = doc.createElement(balise);
  made.textContent = text;
  return made;
};

// The groups of an answer, or null when it is not the shape the main process gives.
/** @param {unknown} answer @returns {Group[] | null} */
function groupsOf(answer) {
  const groups = typeof answer === "object" && answer !== null && "groups" in answer ? answer.groups : undefined;
  if (!Array.isArray(groups) || groups.length !== KEYS.length) return null;
  const good = groups.every(
    (group, rank) =>
      group?.key === KEYS[rank] &&
      typeof group.title === "string" &&
      typeof group.count === "number" &&
      Array.isArray(group.entries) &&
      group.entries.every((/** @type {any} */ entry) => typeof entry?.ticket === "number" && typeof entry.title === "string"),
  );
  return good ? groups : null;
}

/** @param {Fabrique} doc @param {HTMLElement[]} below */
function frame(doc, below) {
  const card = doc.createElement("section");
  card.className = "since-last-looked";
  card.ariaLabel = TITLE;
  card.append(block(doc, "h3", TITLE), ...below);
  return card;
}

// The card of an answer: undefined at the first opening (nothing to compare with), a line when it does not read.
/** @param {Fabrique} doc @param {unknown} answer @param {(ticket: number) => void} open @returns {HTMLElement | undefined} */
export function cardSinceLastLooked(doc, answer, open) {
  if (answer === undefined || answer === null || (typeof answer === "object" && "firstLook" in answer)) return undefined;
  const groups = groupsOf(answer);
  if (groups === null) return frame(doc, [lineError(doc, UNREAD("its answer is not readable"))]);
  const since = /** @type {{ since?: unknown }} */ (answer).since;
  const row = doc.createElement("div");
  row.className = "groups";
  for (const { key, title, count, entries } of groups) {
    const group = doc.createElement("section");
    group.className = "group";
    group.dataset.group = key;
    group.append(block(doc, "h4", `${title} · ${count}`));
    if (entries.length === 0) group.append(lineEmpty(doc, NOTHING));
    else {
      const list = doc.createElement("ul");
      for (const { ticket, title: name, how } of entries) {
        const item = doc.createElement("li");
        const entry = block(doc, "button", `#${ticket} ${name}${how === undefined ? "" : ` — ${how}`}`);
        entry.className = "entry";
        entry.dataset.ticket = String(ticket);
        entry.title = `open issue #${ticket} on GitHub`;
        entry.addEventListener("click", () => open(ticket));
        item.append(entry);
        list.append(item);
      }
      group.append(list);
    }
    row.append(group);
  }
  const card = frame(doc, [row, ...("partial" in /** @type {object} */ (answer) ? [lineError(doc, PARTIAL)] : [])]);
  if (typeof since === "string") card.title = `since ${new Date(since).toLocaleString()}`;
  return card;
}

// The card of each project, read at each opening (`lire`) and posed by the rail (`poser`). `read`: the bridge's reading;
// `open`: opens a ticket's issue; `redraw`: draws the project again once its card is in. An answer that comes after another
// opening of the project is dropped: only the latest opening's card is shown.
/** @param {Fabrique} doc @param {{ read(project: string): Promise<unknown>, open(project: string, ticket: number): void, redraw(project: string): void }} options */
export function holdSinceLastLooked(doc, { read, open, redraw }) {
  /** @type {Map<string, HTMLElement>} */
  const cards = new Map();
  /** @type {Map<string, number>} */
  const asked = new Map();
  let count = 0;
  return {
    /** @param {string} project */
    lire(project) {
      const mine = ++count;
      asked.set(project, mine);
      cards.delete(project);
      void Promise.resolve()
        .then(() => read(project))
        .then(
          (answer) => cardSinceLastLooked(doc, answer, (ticket) => open(project, ticket)),
          // Electron prefixes a refusal of the main process with the channel's name: the chef reads the reason alone.
          (error) => frame(doc, [lineError(doc, UNREAD((error instanceof Error ? error.message : String(error)).replace(/^Error invoking remote method '[^']*': (?:Error: )?/, "")))]),
        )
        .then((card) => {
          if (asked.get(project) !== mine) return;
          if (card === undefined) return;
          cards.set(project, card);
          redraw(project);
        });
    },
    /** @param {string} project @returns {HTMLElement[]} */
    poser: (project) => {
      const card = cards.get(project);
      return card === undefined ? [] : [card];
    },
  };
}
