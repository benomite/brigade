// Admission à la charge (#4210) : la limite vient de la capacité mesurée de la
// machine, jamais du nombre de tickets du rail ; le module n'a aucun nombre de
// tickets écrit en dur.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { admettre, plafondAdmis } from "../../src/admission-charge/admission-charge.ts";

const MODULE = join(import.meta.dirname, "..", "..", "src", "admission-charge", "admission-charge.ts");

test("le plafond ne suit que les cœurs mesurés, par la fonction injectée", () => {
  let lectures = 0;
  const lireMachine = () => {
    lectures++;
    return { charge: 0.1, coeurs: 8 };
  };
  const verdict = admettre({ genre: "cook", enCours: 0, lireMachine, avertir: () => {} });
  assert.ok(lectures >= 1, "la machine est mesurée à chaque demande");
  assert.equal(verdict.admis, true);
  assert.equal(plafondAdmis(8), plafondAdmis(8));
  // Un rail de 40 ou de 2000 tickets ne change rien : l'appel n'en reçoit aucun.
  for (const rail of [40, 2000]) {
    const v = admettre({ genre: "cook", enCours: 0, lireMachine, avertir: () => {}, rail } as never);
    assert.equal(v.admis, true, `rail de ${rail}`);
    assert.equal(admettre({ genre: "cook", enCours: plafondAdmis(8), lireMachine, avertir: () => {}, rail } as never).admis, false, `rail de ${rail}`);
  }
  // Une machine qui change change la limite.
  assert.notEqual(plafondAdmis(2), plafondAdmis(32));
});

test("le module ne porte aucun nombre de tickets écrit en dur", () => {
  const source = readFileSync(MODULE, "utf8").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(source, /\b(40|2000|2_000)\b/);
});
