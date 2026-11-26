// Test d'acceptation gelé (#4302), critère 2. Le contrat que ce test fixe, parce que le ticket le laisse ouvert :
// `runtime/src/renvoi-sur-le-fond/regle.ts` exporte `jugerLaPR({ remarques, ci })` -> `{ action: "merge" | "send-back", notes: string[], motifs: string[] }`.
// `remarques` : `{ nature: "behaviour" | "criterion" | "test-failure" | "form", texte: string }[]` ; `ci` : `"green" | "red"`.
// Une remarque de forme donne une note (ou un correctif) dans `notes`, jamais un motif de renvoi.
import assert from "node:assert/strict";
import { test } from "node:test";
import { jugerLaPR } from "../../src/renvoi-sur-le-fond/regle.ts";

test("a PR with only a form remark gets a note and is merged when CI is green", () => {
  const verdict = jugerLaPR({ remarques: [{ nature: "form", texte: "test name does not follow the naming convention" }], ci: "green" });
  assert.equal(verdict.action, "merge");
  assert.deepEqual(verdict.motifs, []);
  assert.equal(verdict.notes.length, 1);
  assert.match(verdict.notes[0], /naming convention/);
});
