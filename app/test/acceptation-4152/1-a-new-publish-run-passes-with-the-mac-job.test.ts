// Test d'acceptation gelé (#4152). Critère 1 : un nouveau run de publier-app pour app-v1.0.365 finit avec le job `mac`
// vert, et aucun autre job de ce run n'échoue.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

const DEPOT = "benomite/brigade";
const RUN_EN_ECHEC = 45444704528;
const gh = (...args: string[]): unknown => JSON.parse(execFileSync("gh", ["api", ...args], { encoding: "utf8" }));

type Job = { name: string; conclusion: string | null };

test("a new publier-app run for app-v1.0.365 completes with the mac job passing and no other job failing", () => {
  const runs = (gh(`repos/${DEPOT}/actions/workflows/publier-app.yml/runs?per_page=50`) as { workflow_runs: { id: number; status: string }[] }).workflow_runs;
  const nouveaux = runs.filter((run) => run.id > RUN_EN_ECHEC && run.status === "completed");
  const bons = nouveaux.filter((run) => {
    const jobs = (gh(`repos/${DEPOT}/actions/runs/${run.id}/jobs?per_page=100`) as { jobs: Job[] }).jobs;
    const mac = jobs.find((job) => job.name === "mac");
    return mac?.conclusion === "success" && jobs.every((job) => job.conclusion !== "failure" && job.conclusion !== "cancelled" && job.conclusion !== "timed_out");
  });
  assert.ok(bons.length > 0, `no completed publier-app run after ${RUN_EN_ECHEC} has the mac job passing with no failing job`);
});
