// Les onglets de contenu d'un espace : aucun ne relaie plus une commande du runtime (l'onglet Log est parti, #4678) —
// la vue nomme un onglet, jamais une commande, et rien ne part vers la box pour un nom.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { TABS, HEADINGS } from "../src/tabs.ts";

describe("les onglets de contenu d'un espace", () => {
  test("il n'y en a aucun — ni Log (#4678), ni Rail ni Manager (#1700), ni Cooks (#2921), ni Grants (#2924)", () => {
    assert.deepEqual(TABS, []);
    assert.deepEqual(HEADINGS.map(({ lectures: readings }) => readings), [["parametres"]]);
  });

  test("aucun onglet n'est Cost (#4509)", () => {
    assert.ok(!HEADINGS.some(({ titre: title }) => title === "Cost"));
  });
});
