// Test d'acceptation gelé (#4302), critère 3. Le contrat : `jugerLaPR({ remarques, ci })` de
// `runtime/src/renvoi-sur-le-fond/regle.ts` -> `{ action, notes, motifs }` ; une remarque `nature: "test-failure"` renvoie la PR avec le motif `"failing test"`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { jugerLaPR } from "../../src/renvoi-sur-le-fond/regle.ts";

test("a PR with a failing test is sent back with the reason failing test, even next to a form remark", () => {
  const verdict = jugerLaPR({
    remarques: [
      { nature: "test-failure", texte: "rail.test.ts fails" },
      { nature: "form", texte: "test layout" },
    ],
    ci: "red",
  });
  assert.equal(verdict.action, "send-back");
  assert.deepEqual(verdict.motifs, ["failing test"]);
});
