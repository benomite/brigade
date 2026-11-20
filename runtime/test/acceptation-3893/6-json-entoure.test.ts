// #3893, critère 6 : une réponse JSON valide entourée de texte, ou d'une clôture de code, se lit toujours.
import assert from "node:assert/strict";
import { test } from "node:test";
import { lireLesChemins } from "../../src/tests-acceptation/ecriture.ts";

const CHEMINS = ["runtime/test/a.test.ts", "runtime/test/b.test.ts"];
const JSON_VALIDE = JSON.stringify({ tests: CHEMINS });

// brigade:guard
test("a valid JSON answer wrapped in extra text is parsed", () => {
  const lu = lireLesChemins(`I wrote both tests.\n${JSON_VALIDE}\nGood luck.`, 2);
  assert.deepEqual(lu, { chemins: CHEMINS });
});

// brigade:guard
test("a valid JSON answer inside a code fence is parsed", () => {
  const lu = lireLesChemins(`Done:\n\`\`\`json\n${JSON_VALIDE}\n\`\`\`\n`, 2);
  assert.deepEqual(lu, { chemins: CHEMINS });
});
