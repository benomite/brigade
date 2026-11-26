// #4229 : la pass mute contre les tests que la livraison ajoute — sans test ajouté vert sur la branche, elle ne joue rien.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { muter } from "../../src/passe-mutations/mutations.ts";

const DIFF = ["diff --git a/lib/calcul.ts b/lib/calcul.ts", "--- a/lib/calcul.ts", "+++ b/lib/calcul.ts", "@@ -1 +1 @@", "-export const somme = (a: number, b: number) => a - b;", "+export const somme = (a: number, b: number) => a + b;", ""].join("\n");

function outils(t: { after(f: () => void): void }) {
  const racine = mkdtempSync(join(tmpdir(), "tests-ajoutes-"));
  t.after(() => rmSync(racine, { recursive: true, force: true }));
  mkdirSync(join(racine, "lib"), { recursive: true });
  writeFileSync(join(racine, "lib/calcul.ts"), "export const somme = (a: number, b: number) => a + b;\n");
  return {
    fichiers: ["lib/calcul.ts"],
    diff: DIFF,
    branche: racine,
    checkout: async () => ({ worktree: racine, jeter: () => undefined }),
    jouer: async () => ({ code: 1, lignes: ["not ok 1 - adds two numbers"] }),
    budgetMs: 5_000,
    enParallele: 1,
  };
}

// brigade:guard
test("a delivery with no added test green on its branch runs no mutant: the mutants are only counted", async (t) => {
  assert.deepEqual(await muter({ rejeux: [] }, outils(t)), { sansTest: 1 });
  // Un test qui ne passe pas sur la branche n'en est pas un.
  assert.deepEqual(await muter({ rejeux: [{ fichier: "lib/calcul.test.ts", nom: "adds two numbers", main: false, branche: false }] }, outils(t)), { sansTest: 1 });
});

// brigade:guard
test("a delivery with an added test green on its branch runs the mutants against it", async (t) => {
  const mutations = await muter({ rejeux: [{ fichier: "lib/calcul.test.ts", nom: "adds two numbers", main: false, branche: true }] }, outils(t));
  assert.ok("mutants" in mutations);
  assert.equal(mutations.mutants.length, 1);
});
