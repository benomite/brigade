// Admission à la charge (#4210) : une charge faible admet le travail, jusqu'à
// un maximum d'unités concurrentes qui dépend du nombre de cœurs.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { admettre, plafondAdmis } from "../../src/admission-charge/admission-charge.ts";

describe("la machine au repos", () => {
  test("admet jusqu'au plafond des cœurs, puis refuse", () => {
    const lireMachine = () => ({ charge: 0.5, coeurs: 8 });
    const plafond = plafondAdmis(8);
    assert.ok(Number.isInteger(plafond) && plafond >= 1);
    for (const genre of ["cook", "gate"] as const) {
      assert.equal(admettre({ genre, enCours: 0, lireMachine, avertir: () => {} }).admis, true, genre);
      assert.equal(admettre({ genre, enCours: plafond - 1, lireMachine, avertir: () => {} }).admis, true, genre);
      assert.equal(admettre({ genre, enCours: plafond, lireMachine, avertir: () => {} }).admis, false, genre);
    }
  });

  test("le plafond dépend du nombre de cœurs", () => {
    assert.ok(plafondAdmis(1) >= 1);
    assert.ok(plafondAdmis(16) > plafondAdmis(4));
    const sur = (coeurs: number) => admettre({ genre: "cook", enCours: plafondAdmis(4), lireMachine: () => ({ charge: 0.1, coeurs }), avertir: () => {} }).admis;
    assert.equal(sur(4), false);
    assert.equal(sur(16), true);
  });
});
