// Critère 1 (#4273) : le TODO montre une carte par geste retenu, avec son résumé, sa raison et un bouton Approve.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { poserCardsRetenues } from "../../src/held/cards-retenues.ts";
import { Faux, repos } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const ACTIONS = [
  { id: "g1", kind: "split", summary: "split #4129 into 3 tickets", reason: "an epic split is held for the chef", approveCommand: "brigade manager approve g1", heldAt: "2026-11-25T08:00:00Z" },
  { id: "g2", kind: "split", summary: "split #4130 into 2 tickets", reason: "the budget of tickets is nearly spent", approveCommand: "brigade manager approve g2", heldAt: "2026-11-25T08:05:00Z" },
];
const poser = (approuver: (id: string) => Promise<unknown> = async () => undefined, actions = ACTIONS) => poserCardsRetenues(doc, actions, approuver) as Faux[];
const boutons = (card: Faux) => card.dessous("button");

describe("les gestes retenus sur le TODO (#4273)", () => {
  test("une carte par geste, avec le résumé, la raison et un bouton Approve", () => {
    const cards = poser();
    assert.equal(cards.length, ACTIONS.length);
    ACTIONS.forEach((action, i) => {
      const card = cards[i] ?? assert.fail("carte manquante");
      assert.ok(card.textContent.includes(action.summary), action.summary);
      assert.ok(card.textContent.includes(action.reason), action.reason);
      assert.equal(boutons(card).length, 1);
      assert.equal(boutons(card)[0]?.textContent, "Approve");
    });
  });
});
