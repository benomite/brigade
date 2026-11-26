// Critère 2 (#4273) : Approve appelle l'action avec l'id ; la carte part au succès, reste avec une erreur à l'échec.
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

describe("Approve sur une carte de geste retenu (#4273)", () => {
  test("un tap appelle l'action avec l'id du geste, et la carte quitte la liste au succès", async () => {
    const calls: string[] = [];
    const cards = poser(async (id) => void calls.push(id));
    const liste = new Faux("div");
    liste.append(...cards);
    const card = cards[0] ?? assert.fail("carte manquante");
    boutons(card)[0]?.click();
    await repos();
    assert.deepEqual(calls, ["g1"]);
    assert.equal(liste.children.includes(card) && !card.hidden, false, "la carte aurait dû quitter la liste");
    assert.equal(liste.children.filter((une) => !une.hidden).length, 1);
  });

  test("une action qui échoue montre une erreur sur la carte et la garde", async () => {
    const cards = poser(async () => Promise.reject(new Error("the runtime refused")));
    const card = cards[0] ?? assert.fail("carte manquante");
    boutons(card)[0]?.click();
    await repos();
    assert.equal(card.hidden, false);
    assert.ok(card.textContent.includes("the runtime refused"), "l'erreur se lit sur la carte");
    assert.ok(card.textContent.includes(ACTIONS[0]!.summary));
    assert.equal(boutons(card).length, 1);
  });
});
