// @ts-check
// The kanban of a project on the new kitchen (ticket 4482): the six columns the main process reads from the GitHub labels alone
// (tableau/kitchen-board.ts) — Backlog, Ready, Cooking, Pass, Parked, Served —, drawn in place of the plan of the kitchen
// (cuisine/cuisine.js). A card is its voucher (composants/bon): its number opens its issue, its title, its try count when a
// refusal was counted (`try:N`), and its pull request, which opens on GitHub. Nothing else is said: the kitchen writes
// nothing else on GitHub.
// This module does not touch `document`: it receives what creates an element — the view gives its own, the tests a fake.

import { bon } from "../composants/bon/bon.js";
import { pastille } from "../composants/pastille/pastille.js";

/** @typedef {import("../../tableau/kitchen-board.ts").KitchenBoard} KitchenBoard */
/** @typedef {import("../../tableau/kitchen-board.ts").BoardCard} BoardCard */
/** @typedef {import("../composants/pastille/pastille.js").Etat} Etat */
/** @typedef {{ createElement(balise: string): any }} Fabrique */
/** @typedef {{ openIssue(ticket: number): void, openPr(ticket: number): void }} BoardGestures */

// The tone and the state of each column: the colour never carries the information alone (composants/pastille).
/** @type {Record<string, { ton: string, etat?: Etat }>} */
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

/** @param {Fabrique} doc @param {string} balise @param {string} texte */
const block = (doc, balise, texte) => {
  const made = doc.createElement(balise);
  made.textContent = texte;
  return made;
};

/** @param {Fabrique} doc @param {string} texte @param {string} title @param {() => void} gesture */
const link = (doc, texte, title, gesture) => {
  const made = block(doc, "button", texte);
  made.title = title;
  made.addEventListener("click", gesture);
  return made;
};

// One card: its number, which opens its issue; its title; its tries and its pull request on one line, when it has either.
/** @param {Fabrique} doc @param {BoardCard} card @param {string} column @param {BoardGestures} gestures */
function boardCard(doc, card, column, gestures) {
  const numero = link(doc, `#${card.ticket}`, `open issue #${card.ticket} on GitHub`, () => gestures.openIssue(card.ticket));
  numero.className = "ticket mono";
  const voucher = bon(doc, { numero });
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
      const { ton, etat } = LOOK[key] ?? { ton: "gris" };
      const column = doc.createElement("section");
      column.className = "colonne";
      column.dataset.ton = ton;
      column.dataset.colonne = title;
      if (key === "served") column.dataset.defile = "";
      const head = doc.createElement("h4");
      head.append(pastille(doc, etat, title), block(doc, "span", String(cards.length)));
      column.append(head);
      if (cards.length === 0) column.append(block(doc, "p", EMPTY[key] ?? "no ticket"));
      else {
        const list = doc.createElement("ol");
        list.append(...cards.map((card) => boardCard(doc, card, key, gestures)));
        column.append(list);
      }
      return column;
    }),
  );
  return grid;
}
