// Critère d'acceptation du ticket #3831, lu sur GitHub avec `gh`.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

const REPO = "benomite/brigade";
const PR = 3783;
const COMMIT_ROUGE = "1500804";

function gh(...args: string[]): string {
  return execFileSync("gh", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}
type Run = { name: string; conclusion: string | null };
function runs(sha: string): Run[] {
  return (JSON.parse(gh("api", "--paginate", "--slurp", `repos/${REPO}/commits/${sha}/check-runs?per_page=100`)) as { check_runs: Run[] }[])
    .flatMap((p) => p.check_runs);
}

test("no check green before the fix is red after it", () => {
  const sha = (JSON.parse(gh("api", `repos/${REPO}/pulls/${PR}`)) as { head: { sha: string } }).head.sha;
  assert.ok(!sha.startsWith(COMMIT_ROUGE), "a commit after the red one exists");
  const apres = runs(sha);
  const rouges = runs(COMMIT_ROUGE)
    .filter((x) => x.conclusion === "success")
    .filter((x) => apres.some((y) => y.name === x.name && ["failure", "cancelled", "timed_out"].includes(y.conclusion ?? "")))
    .map((x) => x.name);
  assert.deepEqual(rouges, []);
});
