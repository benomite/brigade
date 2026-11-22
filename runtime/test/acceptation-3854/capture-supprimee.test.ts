// #3854, critère 4 : à la tête de la PR #3846, le script de capture rail-attente, son test et les deux PNG de
// docs/captures/3810/ sont supprimés, et plus rien ne les référence.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { test } from "node:test";

const REPO = "benomite/brigade";
const REVUE_SUR = "342e49dd94b5aa154126c6bf5cff8e936c27828a";
const gh = (...args: string[]) => execFileSync("gh", args, { encoding: "utf8", maxBuffer: 1 << 26 });

test("the PR #3846 head deletes the rail-attente capture script, its test and the 3810 PNGs, and nothing references them", { skip: "reads live GitHub state of other deliveries (PR #3783/#3838/#3846); not a code test" }, () => {
  const tete = gh("pr", "view", "3846", "--repo", REPO, "--json", "headRefOid", "--jq", ".headRefOid").trim();
  assert.notEqual(tete, REVUE_SUR, "the PR head is still the reviewed commit: nothing was fixed");
  const arbre = gh("api", `repos/${REPO}/git/trees/${tete}?recursive=1`, "--jq", ".tree[].path").split("\n");
  const restants = arbre.filter((p) => p === "scripts/capture-ecran/ecrans/rail-attente.ts" || p === "scripts/capture-ecran/test/rail-attente.test.ts" || p.startsWith("docs/captures/3810/"));
  assert.deepEqual(restants, [], "these files are still on the PR head");
  execFileSync("git", ["fetch", "--quiet", `https://github.com/${REPO}.git`, "refs/pull/3846/head"], { stdio: "pipe" });
  const grep = spawnSync("git", ["grep", "-n", "-e", "rail-attente", "-e", "captures/3810", "FETCH_HEAD", "--", "scripts", "docs", "runtime", "app", "package.json"], { encoding: "utf8" });
  const refs = grep.stdout.split("\n").filter((l) => /(^|[^\w])rail-attente\.(ts|png)|ecrans\/rail-attente|captures\/3810/.test(l));
  assert.deepEqual(refs, [], "something still references the deleted capture");
});
