// Critère d'acceptation du ticket #3831, lu sur GitHub avec `gh`.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

const REPO = "benomite/brigade";
const PR = 3783;
const ISSUE = 3778;
const COMMIT_ROUGE = "1500804";

function gh(...args: string[]): string {
  return execFileSync("gh", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}
function api<T>(chemin: string): T[] {
  return (JSON.parse(gh("api", "--paginate", "--slurp", chemin)) as T[][]).flat();
}
type Commentaire = { body: string };
function constat(): string {
  const tous = [
    ...api<Commentaire>(`repos/${REPO}/issues/${ISSUE}/comments`),
    ...api<Commentaire>(`repos/${REPO}/issues/${PR}/comments`),
  ];
  const c = tous.filter((x) => /types \(app\)/i.test(x.body) && x.body.includes(COMMIT_ROUGE));
  assert.ok(c.length > 0, `no comment on #${ISSUE} or PR #${PR} about types (app) at ${COMMIT_ROUGE}`);
  return c.map((x) => x.body).join("\n");
}

test("a base-branch cause has its own issue and the PR is up to date, or the comment explains why not", { skip: "reads live GitHub state of other deliveries (PR #3783/#3838/#3846); not a code test" }, () => {
  const corps = constat();
  if (!/already failing on (the )?base/i.test(corps)) return; // other causes: criterion 3
  if (/cannot be cleared|can't be cleared|cannot be fixed from (the|this) PR/i.test(corps)) return;
  const issues = api<{ number: number; title: string; body: string; pull_request?: unknown }>(
    `repos/${REPO}/issues?state=all&per_page=100&sort=created&direction=desc`,
  ).filter((i) => !i.pull_request && i.number > ISSUE && /types \(app\)|error TS/i.test(`${i.title}\n${i.body}`));
  assert.ok(issues.length > 0, "a new issue describes the base error with its output");
  assert.match(issues[0]?.body ?? "", /error TS\d+/);
  const pr = JSON.parse(gh("api", `repos/${REPO}/pulls/${PR}`)) as { base: { ref: string }; head: { sha: string } };
  const cmp = JSON.parse(gh("api", `repos/${REPO}/compare/${pr.base.ref}...${pr.head.sha}`)) as { behind_by: number };
  assert.equal(cmp.behind_by, 0, "the PR branch is up to date with the base");
});
