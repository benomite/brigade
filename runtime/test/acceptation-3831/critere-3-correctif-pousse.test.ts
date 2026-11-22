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

test("a fix is pushed to the PR branch without removing a #3778 deliverable", { skip: "reads live GitHub state of other deliveries (PR #3783/#3838/#3846); not a code test" }, () => {
  const corps = constat();
  if (/already failing on (the )?base/i.test(corps)) return; // criterion 4 covers this cause
  const sha = (JSON.parse(gh("api", `repos/${REPO}/pulls/${PR}`)) as { head: { sha: string } }).head.sha;
  assert.ok(!sha.startsWith(COMMIT_ROUGE), "the PR head moved past the red commit");
  const fichiers = api<{ filename: string; status: string }>(`repos/${REPO}/pulls/${PR}/files?per_page=100`);
  const retires = fichiers.filter((f) => f.status === "removed" && /logo|icon|avatar/i.test(f.filename));
  assert.deepEqual(retires, [], "no logo, icon or avatar deliverable removed");
});
