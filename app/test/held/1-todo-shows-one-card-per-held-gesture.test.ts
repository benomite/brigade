// Critère 1 (#4273) : le TODO montre une carte par geste retenu, avec son résumé, sa raison et un bouton Approve.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { setCardsHeld } from "../../src/held/cards-held.ts";
import { Fake, repos } from "../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) };
const ACTIONS = [
  { id: "g1", kind: "split", summary: "split #4129 into 3 tickets", reason: "an epic split is held for the chef", approveCommand: "brigade manager approve g1", heldAt: "2026-11-25T08:00:00Z" },
  { id: "g2", kind: "split", summary: "split #4130 into 2 tickets", reason: "the budget of tickets is nearly spent", approveCommand: "brigade manager approve g2", heldAt: "2026-11-25T08:05:00Z" },
];
const set = (approve: (id: string) => Promise<unknown> = async () => undefined, actions = ACTIONS) => setCardsHeld(doc, actions, approve) as Fake[];
const buttons = (card: Fake) => card.dessous("button");

describe("les gestes retenus sur le TODO (#4273)", () => {
  test("une carte par geste, avec le résumé, la raison et un bouton Approve", () => {
    const cards = set();
    assert.equal(cards.length, ACTIONS.length);
    ACTIONS.forEach((action, i) => {
      const card = cards[i] ?? assert.fail("carte manquante");
      assert.ok(card.textContent.includes(action.summary), action.summary);
      assert.ok(card.textContent.includes(action.reason), action.reason);
      assert.equal(buttons(card).length, 1);
      assert.equal(buttons(card)[0]?.textContent, "Approve");
    });
  });
});
