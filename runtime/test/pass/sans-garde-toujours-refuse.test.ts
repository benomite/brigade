// #3852 critère 2 : un test ajouté vert sur main et non marqué comme garde reste refusé,
// alors qu'un test marqué, lui, est accepté (le marqueur est ce qui les distingue).
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { jouerOutil } from "../../src/gates.ts";
import { prouver, RESULTAT_TAP, vertsSurLaBase } from "../../src/pass/rouge-sur-main.ts";

const entete = 'import assert from "node:assert/strict";\nimport { test } from "node:test";\nimport { somme } from "./somme.ts";\n';
const GARDE = 'test("somme adds, as before", () => assert.equal(somme(2, 3), 5));\n';
const MARQUE = "// brigade:guard — this test guards a behavior main already has\n";
const { NODE_TEST_CONTEXT: _contexte, ...sansContexte } = process.env;

function projet(dossier: string, fichiers: Record<string, string>) {
  for (const [chemin, contenu] of Object.entries({ "package.json": '{"type":"module"}\n', ...fichiers })) {
    mkdirSync(join(dossier, chemin, ".."), { recursive: true });
    writeFileSync(join(dossier, chemin), contenu);
  }
}

// `somme` is right on main and on the branch: every added test is green on main.
function livraison(t: TestContext, tests: string) {
  const racine = mkdtempSync(join(tmpdir(), "garde-"));
  t.after(() => rmSync(racine, { recursive: true, force: true }));
  const somme = "export const somme = (a: number, b: number) => a + b;\n";
  const branche = join(racine, "branche");
  projet(branche, { "lib/somme.ts": somme, "lib/somme.test.ts": entete + tests });
  return {
    fichiers: ["lib/somme.test.ts"],
    branche,
    base: async () => {
      const worktree = join(racine, "base");
      projet(worktree, { "lib/somme.ts": somme });
      return { worktree, jeter: () => {} };
    },
    jouer: async (worktree: string, dossier: string, args: string[]) => {
      const { code, retenues } = await jouerOutil("bash", ["-c", 'cd -- "$1" && shift && exec "$@"', "rejeu", dossier, process.execPath, ...args], { worktree, ticket: 1, env: sansContexte, delaiMs: 2_000 }, RESULTAT_TAP);
      return { code, lignes: retenues };
    },
  };
}

test("an unmarked test green on main is still refused, while the same test marked as a guard is not", async (t) => {
  const sans = await prouver(["fire"], livraison(t, GARDE));
  assert.equal(vertsSurLaBase(sans).length, 1);
  const marque = await prouver(["fire"], livraison(t, MARQUE + GARDE));
  assert.deepEqual(vertsSurLaBase(marque), []);
});
