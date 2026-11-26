// Test d'acceptation gelé (#4211), critère 2. Le contrat : `classerLeRouge({ gates, lireCharge })` de
// `runtime/src/rouge-de-charge/classeur.ts` -> `"load" | "code"` ; `gates.clockGuardCut` porte la ligne FAIL de la garde d'horloge.
import assert from "node:assert/strict";
import { test } from "node:test";
import { classerLeRouge } from "../../src/rouge-de-charge/classeur.ts";

test("a gate that hits the 300 s clock guard under high load is classified load", () => {
  const ligne = "FAIL  tests coupés à 300 s par la garde d'horloge, aucun test en échec";
  const gates = { outcome: "red", failures: [ligne], clockGuardCut: ligne, tail: "" } as never;
  assert.equal(classerLeRouge({ gates, lireCharge: () => 40 }), "load");
});
