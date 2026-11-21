// Critère d'acceptation du ticket #3831, lu sur GitHub avec `gh`.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

const REPO = "benomite/brigade";
const PR = 3783;
const ISSUE = 3778;

function gh(...args: string[]): string {
  return execFileSync("gh", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}
type Run = { name: string; conclusion: string | null; html_url: string };

test("types (app) is green on the latest PR commit and a comment links the passing run", () => {
  const sha = (JSON.parse(gh("api", `repos/${REPO}/pulls/${PR}`)) as { head: { sha: string } }).head.sha;
  const runs = (JSON.parse(gh("api", "--paginate", "--slurp", `repos/${REPO}/commits/${sha}/check-runs?per_page=100`)) as { check_runs: Run[] }[])
    .flatMap((p) => p.check_runs)
    .filter((x) => /types \(app\)/i.test(x.name));
  assert.ok(runs.length > 0, "a types (app) run exists on the head");
  assert.ok(runs.every((x) => x.conclusion === "success"), "types (app) is green");
  const commentaires = [
    ...(JSON.parse(gh("api", "--paginate", "--slurp", `repos/${REPO}/issues/${ISSUE}/comments`)) as { body: string }[][]).flat(),
    ...(JSON.parse(gh("api", "--paginate", "--slurp", `repos/${REPO}/issues/${PR}/comments`)) as { body: string }[][]).flat(),
  ].map((c) => c.body).join("\n");
  const liens = runs.map((x) => x.html_url.replace(/\/job\/\d+$/, ""));
  assert.ok(liens.some((l) => commentaires.includes(l)), "a comment links the passing run");
});
