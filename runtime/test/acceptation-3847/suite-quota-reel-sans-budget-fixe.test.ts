// #3847, critère 3 : le reste de la suite quota-reel passe à la tête de la PR #3838, et aucun budget fixe
// de station ni part fixe de projet n'a été introduit.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const REPO = "benomite/brigade";
const REVUE_SUR = "e7cc0d16ef2d2a9a59d7d88071bc853bd252d8cc";

test("the whole quota-reel suite passes at the fixed PR head, with no fixed station budget or project share", { skip: "reads live GitHub state of other deliveries (PR #3783/#3838/#3846); not a code test" }, () => {
  const tete = execFileSync("gh", ["pr", "view", "3838", "--repo", REPO, "--json", "headRefOid", "--jq", ".headRefOid"], { encoding: "utf8" }).trim();
  assert.notEqual(tete, REVUE_SUR, "the PR head is still the commit the review blocked");
  const dossier = mkdtempSync(join(tmpdir(), "acceptation-3847-"));
  const archive = execFileSync("git", ["archive", "--format=tar", tete, "runtime"], { maxBuffer: 1 << 28, cwd: process.cwd() });
  execFileSync("tar", ["-x", "-C", dossier], { input: archive });
  const limite = readFileSync(join(dossier, "runtime/src/limite-github.ts"), "utf8");
  assert.doesNotMatch(limite, /BUDGET_STATION|budgetStation|PART_PROJET|partProjet|PART_DU_PROJET|partDuProjet/i, "a fixed budget or share is back");
  assert.doesNotMatch(limite, /\b4_?000\b/, "the old 4000-an-hour station budget is back");
  execFileSync("node", ["--test", "--test-force-exit", join(dossier, "runtime/test/quota-reel/")], { cwd: join(dossier, "runtime"), stdio: "pipe" });
});
