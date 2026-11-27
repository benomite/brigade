// The kanban of the new kitchen, drawn (app/src/vue/kitchen-board/kitchen-board.js, #4543): a card parked for the chef is red
// as on the old rail — drawn like `cardWait`, at the head of its column, its column marked `data-attend` and `data-actif`.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { BoardCard, KitchenBoard } from "../../src/board/kitchen-board.ts";
import { kitchenBoardGrid } from "../../src/vue/kitchen-board/kitchen-board.js";
import { Fake } from "../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) };
const card = (ticket: number, extra: Partial<BoardCard> = {}): BoardCard => ({ ticket, title: `Ticket ${ticket}`, url: `https://github.com/chef/x/issues/${ticket}`, tries: 0, pr: null, ...extra });
const board: KitchenBoard = {
  columns: [
    { key: "backlog", title: "Backlog", cards: [card(1)] },
    { key: "ready", title: "Ready", cards: [] },
    { key: "cooking", title: "Cooking", cards: [] },
    { key: "pass", title: "Pass", cards: [] },
    // #5 only `parked` comes first, #6 `parked:chef` after it: the red one must come to the head.
    { key: "parked", title: "Parked", cards: [card(5), card(6, { forTheChef: true })] },
    { key: "served", title: "Served", cards: [] },
  ],
};
const grid = kitchenBoardGrid(doc, board, { openIssue: () => undefined, openPr: () => undefined }) as unknown as Fake;
const column = (name: string) => grid.children.find((one) => one.dataset.colonne === name) as Fake;
const cardsOf = (name: string) => (column(name).children.find((one) => one.balise === "ol") as Fake).children;

test("a card labelled `parked:chef` is red, at the head of its column; a card only `parked` is not", () => {
  const [first, second] = cardsOf("Parked") as [Fake, Fake];
  assert.equal(first.dataset.ticket, "6");
  assert.equal(first.dataset.carte, "attente");
  assert.equal(second.dataset.ticket, "5");
  assert.equal(second.dataset.carte, undefined);
  assert.equal(cardsOf("Backlog")[0]?.dataset.carte, undefined);
});

test("its column is marked like the old rail's (`data-attend`, `data-actif`); the others are not", () => {
  assert.ok("attend" in column("Parked").dataset);
  assert.ok("actif" in column("Parked").dataset);
  for (const name of ["Backlog", "Ready", "Cooking", "Pass", "Served"]) {
    assert.ok(!("attend" in column(name).dataset), name);
    assert.ok(!("actif" in column(name).dataset), name);
  }
});
