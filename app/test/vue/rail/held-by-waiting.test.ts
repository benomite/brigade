// Ticket 3761 : un ticket en file retenu par un ticket en WAITING est dit en WAITING sur le rail de l'app. Ce que `facts`
// porte de la raison `waiting` de la ligne en tête du rail, jusqu'à la vue.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { waitOfRailRead } from "../../../src/vue/wait-of-rail/wait-of-rail.ts";

describe("la ligne en tête du rail", () => {
  test("`facts` porte la raison `waiting` jusqu'à la vue", () => {
    assert.deepEqual(waitOfRailRead({ raison: "waiting", phrase: "x", geste: null, stations: [] }), { attenteDuRail: { raison: "waiting", phrase: "x", geste: null, stations: [] } });
  });
});
