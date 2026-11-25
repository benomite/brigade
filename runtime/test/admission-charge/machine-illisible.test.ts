// Admission à la charge (#4210) : une machine dont la charge ne se lit pas
// n'admet rien — rien ne dit qu'elle ait la place —, et le report se dit.
import assert from "node:assert/strict";
import { test } from "node:test";
import { admettre } from "../../src/admission-charge/admission-charge.ts";

test("a machine whose load cannot be read admits no cook nor gate, and the deferral says why", () => {
  for (const genre of ["cook", "gate"] as const) {
    const lignes: string[] = [];
    const verdict = admettre({
      genre,
      enCours: 0,
      lireMachine: () => {
        throw new Error("loadavg refused");
      },
      avertir: (ligne) => lignes.push(ligne),
    });
    assert.equal(verdict.admis, false, genre);
    assert.deepEqual(lignes, [`brigade : admission deferred — a new ${genre} waits on the rail: the machine's load could not be read (loadavg refused)`]);
  }
});

test("the load tolerated per core is the caller's when it gives one", () => {
  const lireMachine = () => ({ charge: 9, coeurs: 8 });
  assert.equal(admettre({ genre: "cook", enCours: 0, lireMachine, avertir: () => {} }).admis, true);
  assert.equal(admettre({ genre: "cook", enCours: 0, lireMachine, avertir: () => {}, chargeParCoeur: 1 }).admis, false);
});
