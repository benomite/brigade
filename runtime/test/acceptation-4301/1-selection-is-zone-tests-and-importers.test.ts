// Test d'acceptation gelé (#4301), critère 1. Le contrat que ce test fixe, parce que le ticket le laisse ouvert :
// `runtime/src/tests-de-la-zone/tests-de-la-zone.ts` exporte `selectionnerTests(zone, racine)`, où `zone` est la liste des
// chemins de la fiche (relatifs à `racine`) et `racine` la racine du dépôt ; il rend
// `{ tests: string[], aEcrire: boolean, consigne: string }` — `tests` : les chemins relatifs, triés, des fichiers `*.test.ts`
// choisis ; `aEcrire` : vrai quand aucun test ne couvre la zone ; `consigne` : le texte dit au cook dans ce cas.
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

test("for a ticket with zone runtime/src/a/, the selected tests are those of runtime/test/a/ and those importing runtime/src/a/, and no other", (t) => {
  const racine = mkdtempSync(join(tmpdir(), "tests-zone-"));
  t.after(() => rmSync(racine, { recursive: true, force: true }));
  ecrire(racine, "runtime/src/a/code.ts", "export const a = 1;\n");
  ecrire(racine, "runtime/src/b/autre.ts", "export const b = 2;\n");
  ecrire(racine, "runtime/test/a/direct.test.ts", "import { test } from 'node:test';\ntest('x', () => {});\n");
  ecrire(racine, "runtime/test/importeur.test.ts", "import { a } from '../src/a/code.ts';\nvoid a;\n");
  ecrire(racine, "runtime/test/autre/importeur-profond.test.ts", "import { a } from '../../src/a/code.ts';\nvoid a;\n");
  ecrire(racine, "runtime/test/etranger.test.ts", "import { b } from '../src/b/autre.ts';\nvoid b;\n");
  ecrire(racine, "runtime/test/b/rien.test.ts", "import { test } from 'node:test';\ntest('y', () => {});\n");
  const choix = selectionnerTests(["runtime/src/a/"], racine);
  assert.deepEqual(choix.tests, [
    "runtime/test/a/direct.test.ts",
    "runtime/test/autre/importeur-profond.test.ts",
    "runtime/test/importeur.test.ts",
  ]);
  assert.equal(choix.aEcrire, false);
});
