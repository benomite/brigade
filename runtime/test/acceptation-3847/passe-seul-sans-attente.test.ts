// #3847, critère 2 : à la tête de la PR #3838, sans-attente-au-dessus-de-mille.test.ts passe seul,
// et il affirme qu'aucune attente n'est appliquée quand le quota réel restant dépasse 1000.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const REPO = "benomite/brigade";
const REVUE_SUR = "e7cc0d16ef2d2a9a59d7d88071bc853bd252d8cc";
const FICHIER = "runtime/test/quota-reel/sans-attente-au-dessus-de-mille.test.ts";
const gh = (...args: string[]) => execFileSync("gh", args, { encoding: "utf8" });

test("the PR #3838 test passes alone at the fixed head, and asserts zero wait above 1000 remaining", { skip: "reads live GitHub state of other deliveries (PR #3783/#3838/#3846); not a code test" }, () => {
  const tete = gh("pr", "view", "3838", "--repo", REPO, "--json", "headRefOid", "--jq", ".headRefOid").trim();
  assert.notEqual(tete, REVUE_SUR, "the PR head is still the commit the review blocked");
  const dossier = mkdtempSync(join(tmpdir(), "acceptation-3847-"));
  const archive = execFileSync("git", ["archive", "--format=tar", tete, "runtime"], { maxBuffer: 1 << 28, cwd: process.cwd() });
  execFileSync("tar", ["-x", "-C", dossier], { input: archive });
  const test = join(dossier, FICHIER);
  const source = readFileSync(test, "utf8");
  assert.match(source, /1000|1_000/, "the test does not mention the 1000 threshold");
  assert.match(source, /assert\.(equal|strictEqual)\([^)]*,\s*0\b/, "the test does not assert a zero wait");
  execFileSync("node", ["--test", test], { cwd: join(dossier, "runtime"), stdio: "pipe" });
});
