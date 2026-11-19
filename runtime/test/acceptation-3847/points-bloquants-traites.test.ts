// #3847, critère 1 : chaque point bloquant de la revue de la PR #3838 (sur e7cc0d1) portant sur
// sans-attente-au-dessus-de-mille.test.ts est traité dans le code ou le test de la branche de la PR.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

const REPO = "benomite/brigade";
const REVUE_SUR = "e7cc0d16ef2d2a9a59d7d88071bc853bd252d8cc";
const FICHIER = "runtime/test/quota-reel/sans-attente-au-dessus-de-mille.test.ts";
const gh = (...args: string[]) => execFileSync("gh", args, { encoding: "utf8" });

test("the PR #3838 branch moved past the reviewed commit, and its review is re-requested", () => {
  const pr = JSON.parse(gh("pr", "view", "3838", "--repo", REPO, "--json", "headRefOid,reviewRequests,reviewDecision,commits"));
  assert.notEqual(pr.headRefOid, REVUE_SUR, "the PR head is still the reviewed commit: nothing was fixed");
  const apres = gh("api", `repos/${REPO}/compare/${REVUE_SUR}...${pr.headRefOid}`, "--jq", ".files[].filename").split("\n");
  assert.ok(
    apres.some((f) => f.startsWith("runtime/")),
    `no runtime file changed since the review (touched: ${apres.join(", ")}); ${FICHIER} or the code it covers must change`,
  );
  const revues = JSON.parse(gh("api", `repos/${REPO}/pulls/3838/reviews`)) as { commit_id: string }[];
  assert.ok(revues.length > 0, "the PR has no review");
  const demandes = (pr.reviewRequests ?? []).length;
  assert.ok(demandes > 0 || pr.reviewDecision === "APPROVED", "the review was not re-requested after the fix");
});
