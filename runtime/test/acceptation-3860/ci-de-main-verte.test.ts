// #3860, critère 1 : la CI de `main` est verte une fois la livraison fusionnée — chaque part de la CI
// Windows du runtime, `windows tests (n/8)`, conclut en succès sur le dernier commit de `main`.
// Test d'acceptation gelé (#3725) : il lit GitHub par `gh`, et se saute où `gh` n'est pas connecté.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

const REPO = "benomite/brigade";
const gh = (...args: string[]) => execFileSync("gh", args, { encoding: "utf8", maxBuffer: 1 << 26 });

test("every `windows tests (n/8)` check of the latest commit of main concludes in success", () => {
  const lignes = gh("api", `repos/${REPO}/commits/main/check-runs?per_page=100`, "--paginate", "--jq", '.check_runs[] | select(.name | startswith("windows tests (")) | "\\(.name)\\t\\(.status)\\t\\(.conclusion)"')
    .trim()
    .split("\n")
    .filter(Boolean);
  const parts = new Set(lignes.map((l) => l.split("\t")[0]));
  assert.equal(parts.size, 8, `expected the 8 parts of windows tests on main, got: ${[...parts].join(", ") || "none"}`);
  const pasVertes = lignes.filter((l) => l.split("\t").slice(1).join("\t") !== "completed\tsuccess");
  assert.deepEqual(pasVertes, [], "a windows tests part of main is not green");
});
