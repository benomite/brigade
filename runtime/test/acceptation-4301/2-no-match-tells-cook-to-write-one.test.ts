// Test d'acceptation gelé (#4301), critère 2. Le contrat est celui de 1-selection-is-zone-tests-and-importers.test.ts :
// `selectionnerTests(zone, racine)` du module `runtime/src/tests-de-la-zone/tests-de-la-zone.ts` rend
// `{ tests, aEcrire, consigne }`.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { selectionnerTests } from "../../src/tests-de-la-zone/tests-de-la-zone.ts";

function ecrire(racine: string, chemin: string, texte: string): void {
  mkdirSync(dirname(join(racine, chemin)), { recursive: true });
  writeFileSync(join(racine, chemin), texte);
}

test("when no test matches the zone, the cook is told to write one and the selection is empty, not the full suite", (t) => {
  const racine = mkdtempSync(join(tmpdir(), "tests-zone-"));
  t.after(() => rmSync(racine, { recursive: true, force: true }));
  ecrire(racine, "runtime/src/a/code.ts", "export const a = 1;\n");
  ecrire(racine, "runtime/src/b/autre.ts", "export const b = 2;\n");
  ecrire(racine, "runtime/test/b/rien.test.ts", "import { b } from '../../src/b/autre.ts';\nvoid b;\n");
  ecrire(racine, "runtime/test/c.test.ts", "import { test } from 'node:test';\ntest('c', () => {});\n");
  const choix = selectionnerTests(["runtime/src/a/"], racine);
  assert.deepEqual(choix.tests, [], "pas de repli sur la suite entière");
  assert.equal(choix.aEcrire, true);
  assert.match(choix.consigne, /write (a|one|the)\b.*test|test.*\bwrite\b/i);
});
