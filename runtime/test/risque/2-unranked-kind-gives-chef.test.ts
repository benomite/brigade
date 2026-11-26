// Test d'acceptation gelé (#4230), critère 2. Contrat : voir le test du critère 1 (`rangDuGenre` de `runtime/src/risque/risque.ts`).
import assert from "node:assert/strict";
import { test } from "node:test";
import { rangDuGenre } from "../../src/risque/risque.ts";

test("a kind that is not in the ranking gives 'chef'", () => {
  assert.equal(rangDuGenre({ risk: { "fix-typo": "safe" } }, "launch-rocket"), "chef");
  assert.equal(rangDuGenre({}, "launch-rocket"), "chef");
  assert.equal(rangDuGenre({ risk: { "fix-typo": "safe" } }, "fix-typo"), "safe");
});
