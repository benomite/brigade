// Critère 1 (#4273) : le TODO montre une carte par geste retenu, avec son résumé, sa raison et un bouton Approve.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { poserCartesRetenues } from "../../src/held/cartes-retenues.ts";
import { Faux, repos } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const GESTES = [
  { id: "g1", kind: "split", summary: "split #4129 into 3 tickets", reason: "an epic split is held for the chef", approveCommand: "brigade manager approve g1", heldAt: "2026-11-25T08:00:00Z" },
  { id: "g2", kind: "split", summary: "split #4130 into 2 tickets", reason: "the budget of tickets is nearly spent", approveCommand: "brigade manager approve g2", heldAt: "2026-11-25T08:05:00Z" },
];
const poser = (approuver: (id: string) => Promise<unknown> = async () => undefined, gestes = GESTES) => poserCartesRetenues(doc, gestes, approuver) as Faux[];
const boutons = (carte: Faux) => carte.dessous("button");

describe("les gestes retenus sur le TODO (#4273)", () => {
  test("une carte par geste, avec le résumé, la raison et un bouton Approve", () => {
    const cartes = poser();
    assert.equal(cartes.length, GESTES.length);
    GESTES.forEach((geste, i) => {
      const carte = cartes[i] ?? assert.fail("carte manquante");
      assert.ok(carte.textContent.includes(geste.summary), geste.summary);
      assert.ok(carte.textContent.includes(geste.reason), geste.reason);
      assert.equal(boutons(carte).length, 1);
      assert.equal(boutons(carte)[0]?.textContent, "Approve");
    });
  });
});
