// Critère 2 (#4273) : Approve appelle l'action avec l'id ; la carte part au succès, reste avec une erreur à l'échec.
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

describe("Approve sur une carte de geste retenu (#4273)", () => {
  test("un tap appelle l'action avec l'id du geste, et la carte quitte la liste au succès", async () => {
    const appels: string[] = [];
    const cartes = poser(async (id) => void appels.push(id));
    const liste = new Faux("div");
    liste.append(...cartes);
    const carte = cartes[0] ?? assert.fail("carte manquante");
    boutons(carte)[0]?.click();
    await repos();
    assert.deepEqual(appels, ["g1"]);
    assert.equal(liste.children.includes(carte) && !carte.hidden, false, "la carte aurait dû quitter la liste");
    assert.equal(liste.children.filter((une) => !une.hidden).length, 1);
  });

  test("une action qui échoue montre une erreur sur la carte et la garde", async () => {
    const cartes = poser(async () => Promise.reject(new Error("the runtime refused")));
    const carte = cartes[0] ?? assert.fail("carte manquante");
    boutons(carte)[0]?.click();
    await repos();
    assert.equal(carte.hidden, false);
    assert.ok(carte.textContent.includes("the runtime refused"), "l'erreur se lit sur la carte");
    assert.ok(carte.textContent.includes(GESTES[0]!.summary));
    assert.equal(boutons(carte).length, 1);
  });
});
