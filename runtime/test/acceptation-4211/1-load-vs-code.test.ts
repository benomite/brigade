// Test d'acceptation gelé (#4211), critère 1. Le contrat que ce test fixe, parce que le ticket le laisse ouvert :
// `runtime/src/rouge-de-charge/classeur.ts` exporte `classerLeRouge({ gates, lireCharge })` -> `"load" | "code"`.
// `gates` : un résultat de gates (`outcome`, `failures`, `clockGuardCut?`) ; `lireCharge(): number` est la lecture injectable de la charge machine (load average).
import assert from "node:assert/strict";
import { test } from "node:test";
import { classerLeRouge } from "../../src/rouge-de-charge/classeur.ts";

const rouge = { outcome: "red", failures: ["FAIL  test x"], tail: "" } as never;

test("a red gate under a faked high load is classified load, and the same result on a calm machine is classified code", () => {
  assert.equal(classerLeRouge({ gates: rouge, lireCharge: () => 40 }), "load");
  assert.equal(classerLeRouge({ gates: rouge, lireCharge: () => 0.2 }), "code");
});
