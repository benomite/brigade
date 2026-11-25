// Admission à la charge (#4210, épique #4110) : sous une charge de 27 sur 8 cœurs,
// le module refuse d'admettre un nouveau cook ou une nouvelle gate.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { admettre } from "../../src/admission-charge/admission-charge.ts";

describe("la machine chargée", () => {
  test("une charge de 27 sur 8 cœurs : ni un cook ni une gate n'est admis, même quand rien ne tourne", () => {
    const lireMachine = () => ({ charge: 27, coeurs: 8 });
    for (const genre of ["cook", "gate"] as const) {
      const verdict = admettre({ genre, enCours: 0, lireMachine, avertir: () => {} });
      assert.equal(verdict.admis, false, genre);
    }
    assert.equal(admettre({ genre: "cook", enCours: 5, lireMachine, avertir: () => {} }).admis, false);
  });
});
