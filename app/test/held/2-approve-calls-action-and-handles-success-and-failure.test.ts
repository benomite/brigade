// Critère 2 (#4273) : Approve appelle l'action avec l'id ; la carte part au succès, reste avec une erreur à l'échec.
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

describe("Approve sur une carte de geste retenu (#4273)", () => {
  test("un tap appelle l'action avec l'id du geste, et la carte quitte la liste au succès", async () => {
    const calls: string[] = [];
    const cards = set(async (id) => void calls.push(id));
    const list = new Fake("div");
    list.append(...cards);
    const card = cards[0] ?? assert.fail("carte manquante");
    buttons(card)[0]?.click();
    await repos();
    assert.deepEqual(calls, ["g1"]);
    assert.equal(list.children.includes(card) && !card.hidden, false, "la carte aurait dû quitter la liste");
    assert.equal(list.children.filter((one) => !one.hidden).length, 1);
  });

  test("une action qui échoue montre une erreur sur la carte et la garde", async () => {
    const cards = set(async () => Promise.reject(new Error("the runtime refused")));
    const card = cards[0] ?? assert.fail("carte manquante");
    buttons(card)[0]?.click();
    await repos();
    assert.equal(card.hidden, false);
    assert.ok(card.textContent.includes("the runtime refused"), "l'erreur se lit sur la carte");
    assert.ok(card.textContent.includes(ACTIONS[0]!.summary));
    assert.equal(buttons(card).length, 1);
  });
});
