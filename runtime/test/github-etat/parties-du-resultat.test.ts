// Le résultat de la pass dit ses trois parties — checks, CI, relecture — sur sa première ligne (#4227) ; le motif
// suit, là où les renvois le lisent.
import assert from "node:assert/strict";
import { test } from "node:test";
import { corpsDeVerdict, partiesDuResultat } from "../../src/github-etat/fusion.ts";
import { CONTEXTE_DES_GATES } from "../../src/github-etat/gates-de-la-tete.ts";

test("the checks part reads the gates' status of the head, the CI part the other checks", () => {
  assert.deepEqual(partiesDuResultat([{ name: CONTEXTE_DES_GATES, outcome: "green" }], false), { checks: "green", ci: "none on this project's PRs" });
  assert.deepEqual(partiesDuResultat([{ name: CONTEXTE_DES_GATES, outcome: "red" }, { name: "tests", outcome: "green" }], false), { checks: "red", ci: "green" });
  assert.deepEqual(partiesDuResultat([{ name: CONTEXTE_DES_GATES, outcome: "pending" }, { name: "tests", outcome: "pending" }], false), { checks: "running", ci: "running" });
  assert.deepEqual(partiesDuResultat([], false), { checks: "not run yet, the pass runs them on the head it merges", ci: "none on this project's PRs" });
  assert.deepEqual(partiesDuResultat([], true), { checks: "run by the CI of the PR", ci: "not started" });
  assert.deepEqual(partiesDuResultat([{ name: "tests", outcome: "red" }], true), { checks: "run by the CI of the PR", ci: "red" });
});

test("the result's first line says the verdict and its three parts; the reason follows on its own lines", () => {
  const corps = corpsDeVerdict("box", "a1", { verdict: "request-changes", motif: "Fix the button.", parties: { checks: "green", ci: "red" } });
  assert.equal(corps, "<!-- brigade:verdict station=box verdict=request-changes sha=a1 -->\nChanges requested by station `box`. Checks: green. CI: red. Review: changes requested.\n\nFix the button.");
  assert.equal(corps.split("\n").slice(2).join("\n").trim(), "Fix the button.");
});
