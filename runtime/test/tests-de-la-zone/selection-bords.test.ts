import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { selectionnerTests } from "../../src/tests-de-la-zone/tests-de-la-zone.ts";

function depot(fichiers: Record<string, string>): string {
  const racine = mkdtempSync(join(tmpdir(), "zone-"));
  for (const [chemin, contenu] of Object.entries(fichiers)) {
    mkdirSync(join(racine, chemin, ".."), { recursive: true });
    writeFileSync(join(racine, chemin), contenu);
  }
  return racine;
}

test("a test file inside the zone itself is selected, with no mirror folder and no import", () => {
  const racine = depot({ "pkg/a/x.test.ts": "// nothing", "pkg/b/y.test.ts": "// nothing" });
  const { tests, aEcrire } = selectionnerTests(["pkg/a"], racine);
  assert.deepEqual(tests, ["pkg/a/x.test.ts"]);
  assert.equal(aEcrire, false);
});

test("a zone whose top folder does not exist selects nothing and asks for a test, without throwing", () => {
  const racine = depot({ "other/z.test.ts": "// nothing" });
  const resultat = selectionnerTests(["absent/src/a"], racine);
  assert.deepEqual(resultat.tests, []);
  assert.equal(resultat.aEcrire, true);
});
