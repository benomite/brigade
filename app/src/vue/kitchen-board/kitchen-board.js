// @ts-check
// The kanban of a project on the new kitchen (ticket 4482): the six columns the main process reads from the GitHub labels alone
// (board/kitchen-board.ts) — Backlog, Ready, Cooking, Pass, Parked, Served —, drawn in place of the plan of the kitchen
// (kitchen/kitchen.js). A card is its voucher (components/slip): its number opens its issue, its title, its try count when a
// refusal was counted (`try:N`), how long it has been in its column (how long it took, when served), the lines its pull
// request adds and removes, and that pull request, which opens on GitHub. No station: the kitchen writes none on GitHub.
// This module does not touch `document`: it receives what creates an element — the view gives its own, the tests a fake.

import { cardWait } from "../components/card-wait/card-wait.js";
import { slip } from "../components/slip/slip.js";
import { pill } from "../components/pill/pill.js";

/** @typedef {import("../../board/kitchen-board.ts").KitchenBoard} KitchenBoard */
/** @typedef {import("../../board/kitchen-board.ts").BoardCard} BoardCard */
/** @typedef {import("../components/pill/pill.js").State} State */
/** @typedef {{ createElement(balise: string): any }} Fabrique */
/** @typedef {{ openIssue(ticket: number): void, openPr(ticket: number): void }} BoardGestures */

/** @param {BoardCard} card */
const isRed = (card) => card.forTheChef === true;

// The tone and the state of each column: the colour never carries the information alone (components/pill).
/** @type {Record<string, { ton: string, etat?: State }>} */
const LOOK = {
  backlog: { ton: "gris" },
  ready: { ton: "gris", etat: "queued" },
  cooking: { ton: "bleu", etat: "taken" },
  pass: { ton: "jaune", etat: "pass" },
  parked: { ton: "orange", etat: "waiting" },
  served: { ton: "vert", etat: "served" },
};
// The kitchen's limit: the third refusal parks the ticket for the chef (runtime/src/kitchen/decide.ts, `TRIES_MAX`).
const TRIES_MAX = 3;
/** @type {Record<string, string>} */
const EMPTY = {
  backlog: "no ticket in the backlog",
  ready: "no ticket is ready",
  cooking: "no cook at work",
  pass: "no delivery waits for the pass",
  parked: "no ticket is parked",
  served: "nothing served in the last 24 h",
};

// A duration, short: "<1 min", "42 min", "3 h", "2 d".
/** @param {number} ms */
export const shortDuration = (ms) => {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "<1 min";
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 48 * 60) return `${Math.floor(minutes / 60)} h`;
  return `${Math.floor(minutes / 1440)} d`;
};

/** @param {Fabrique} doc @param {string} balise @param {string} text */
const block = (doc, balise, text) => {
  const made = doc.createElement(balise);
  made.textContent = text;
  return made;
};

/** @param {Fabrique} doc @param {string} text @param {string} title @param {() => void} gesture */
const link = (doc, text, title, gesture) => {
  const made = block(doc, "button", text);
  made.title = title;
  made.addEventListener("click", gesture);
  return made;
};

// One card: its number, which opens its issue; its title; its tries and its pull request on one line, when it has either.
/** @param {Fabrique} doc @param {BoardCard} card @param {string} column @param {BoardGestures} gestures */
function boardCard(doc, card, column, gestures) {
  const number = link(doc, `#${card.ticket}`, `open issue #${card.ticket} on GitHub`, () => gestures.openIssue(card.ticket));
  number.className = "ticket mono";
  // A card parked for the chef is red, as on the old rail (ticket 3458): the same card as `cardWait` draws there.
  const voucher = card.forTheChef === true ? cardWait(doc, { numero: number }) : slip(doc, { numero: number });
  voucher.dataset.ticket = String(card.ticket);
  voucher.append(block(doc, "strong", card.title));
  const said = [];
  if (column === "parked") said.push(block(doc, "span", card.forTheChef === true ? "parked for the chef" : "parked"));
  if (card.tries > 0) {
    const tries = block(doc, "span", `try ${card.tries}/${TRIES_MAX}`);
    tries.className = "essais-du-kanban mono";
    tries.title = `${card.tries} ${card.tries === 1 ? "refusal" : "refusals"} so far (\`try:${card.tries}\`): at ${TRIES_MAX}, the kitchen parks it for the chef`;
    said.push(tries);
  }
  if (card.durationMs !== undefined) {
    const time = block(doc, "span", column === "served" ? `took ${shortDuration(card.durationMs)}` : shortDuration(card.durationMs));
    time.className = "duree-du-kanban mono";
    time.title = column === "served" ? "from the cook taking it to the merge" : "time since it entered this column (its label's date on GitHub)";
    said.push(time);
  }
  if (card.lines !== undefined) {
    const lines = block(doc, "span", `+${card.lines.added} / \u2212${card.lines.removed}`);
    lines.className = "lignes-du-kanban mono";
    lines.title = "lines its pull request adds and removes";
    said.push(lines);
  }
  if (card.pr !== null) {
    const pr = link(doc, `PR #${card.pr.number}`, `open pull request #${card.pr.number} on GitHub`, () => gestures.openPr(card.ticket));
    pr.className = "lien-de-ligne mono";
    said.push(pr);
  }
  if (said.length > 0) {
    const line = doc.createElement("p");
    line.className = "ligne-carte";
    for (const [rank, one] of said.entries()) line.append(...(rank === 0 ? [one] : [block(doc, "span", " · "), one]));
    voucher.append(line);
  }
  return voucher;
}

// The grid of the six columns, in the order the reading gives them.
/** @param {Fabrique} doc @param {KitchenBoard} board @param {BoardGestures} gestures */
export function kitchenBoardGrid(doc, board, gestures) {
  const grid = doc.createElement("div");
  grid.className = "colonnes kanban-de-la-cuisine";
  grid.append(
    ...board.columns.map(({ key, title, cards }) => {
      const { ton: your, etat: state } = LOOK[key] ?? { ton: "gris" };
      const column = doc.createElement("section");
      column.className = "colonne";
      column.dataset.ton = your;
      column.dataset.colonne = title;
      if (key === "served") column.dataset.defile = "";
      // As on the old rail (vue.js): a red card marks its column, and a column with a card for the chef is in view when the board opens.
      const red = cards.some(isRed);
      if (red) column.dataset.attend = "";
      if (red) column.dataset.actif = "";
      const head = doc.createElement("h4");
      head.append(pill(doc, state, title), block(doc, "span", String(cards.length)));
      column.append(head);
      if (cards.length === 0) column.append(block(doc, "p", EMPTY[key] ?? "no ticket"));
      else {
        const list = doc.createElement("ol");
        list.append(...[...cards.filter(isRed), ...cards.filter((card) => !isRed(card))].map((card) => boardCard(doc, card, key, gestures)));
        column.append(list);
      }
      return column;
    }),
  );
  return grid;
}
