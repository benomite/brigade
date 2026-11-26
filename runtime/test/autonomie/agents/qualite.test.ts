// The quality figures the policy reads in the runtime (#4380): the reverts from the clone's base, the escaped bugs from
// GitHub.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { lireLaQualite } from "../../../src/autonomie/agents/qualite.ts";
import type { IssueDepuis } from "../../../src/github.ts";
import { ENV_GIT, git, repertoireTemporaire } from "../../outils.ts";

const MAINTENANT = new Date();
const JOUR_MS = 24 * 3600_000;
const ilYa = (jours: number) => new Date(MAINTENANT.getTime() - jours * JOUR_MS).toISOString();
function commit(clone: string, message: string, date = ilYa(1)): string {
  execFileSync("git", ["commit", "-q", "--allow-empty", "-m", message], { cwd: clone, env: { ...ENV_GIT, GIT_COMMITTER_DATE: date, GIT_AUTHOR_DATE: date }, stdio: "ignore" });
  return git(clone, "rev-parse", "HEAD");
}
const issue = (number: number, labels: string[], createdAt: string, title: string, body = ""): IssueDepuis => ({ number, title, labels, state: "open", createdAt, updatedAt: createdAt, body, association: "OWNER" }) as IssueDepuis;

test("the reverts of the base in the period, with their reverted commits' tickets, and the escaped bugs created in it", async (t) => {
  const clone = repertoireTemporaire(t);
  git(clone, "init", "-q", "--initial-branch=main");
  const merge = commit(clone, "Merge pull request #40 from o/cook/12-fix");
  const vieux = commit(clone, "old work (#5)", ilYa(40));
  commit(clone, `Revert "old"\n\nThis reverts commit ${vieux}.`, ilYa(35));
  const revertDuMerge = commit(clone, `Revert "Merge pull request #40"\n\nThis reverts commit ${merge}.`);
  const revertInconnu = commit(clone, "Revert\n\nThis reverts commit 1234567abcdef1234567abcdef1234567abcdef.");
  commit(clone, "plain work, no revert");
  git(clone, "update-ref", "refs/remotes/origin/main", "HEAD");
  let rapatrie = 0;
  let depuis = "";
  const github = {
    issuesDepuis: async (instant: string) => {
      depuis = instant;
      return [
        issue(77, ["Bug"], ilYa(2), "#12 broke the build", "see #77 and #13"),
        issue(78, ["enhancement"], ilYa(2), "#12 could be faster"),
        issue(79, ["bug"], ilYa(31), "#12 old bug"),
        issue(80, ["bug"], ilYa(2), "a bug citing nothing", "only #80"),
      ];
    },
  };
  const lu = await lireLaQualite({ depot: { rapatrier: async () => (rapatrie++, "") }, clone, base: "main", depotGitHub: "o/shop", github, env: ENV_GIT }, MAINTENANT);
  assert.equal(rapatrie, 1);
  assert.equal(depuis, ilYa(30));
  assert.deepEqual(
    lu.reverts.map(({ sha, revertes, tickets }) => ({ sha, revertes, tickets })).sort((a, b) => a.sha.localeCompare(b.sha)),
    [
      { sha: revertDuMerge, revertes: [merge], tickets: [12, 40] },
      { sha: revertInconnu, revertes: ["1234567abcdef1234567abcdef1234567abcdef"], tickets: [] },
    ].sort((a, b) => a.sha.localeCompare(b.sha)),
  );
  assert.deepEqual(lu.bugsEchappes, [{ depot: "o/shop", bug: 77, titre: "#12 broke the build", url: "https://github.com/o/shop/issues/77", tickets: [12, 13] }]);
});

test("a base the clone cannot read throws: the policy moves nothing", async (t) => {
  const clone = repertoireTemporaire(t);
  git(clone, "init", "-q", "--initial-branch=main");
  await assert.rejects(lireLaQualite({ depot: { rapatrier: async () => "" }, clone, base: "main", depotGitHub: "o/shop", github: { issuesDepuis: async () => [] }, env: ENV_GIT }, MAINTENANT));
});
