// #3952, critère 2 : sur la même PR, tests tous verts, le run est vert et le statut est success.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const WORKFLOW = readFileSync(new URL("../../../.github/workflows/tests.yml", import.meta.url), "utf8").replace(/^\s*#.*$/gm, "");

test("a passing check posts the success state, and the run stays green", () => {
  assert.match(WORKFLOW, /statuses: write/, "the workflow may write commit statuses");
  assert.match(WORKFLOW, /target_url/, "the status links to the job");
  assert.match(WORKFLOW, /success/, "the success state is posted");
  const etats = WORKFLOW.match(/state[=:]\s*["']?\$\{?[^\n]*/g) ?? [];
  assert.ok(etats.length > 0, "the state posted is computed from the outcome of the check, not hard-coded");
  assert.doesNotMatch(WORKFLOW, /needs\.tests\.result }}" = success \|\| \{[^\n]*exit 1/, "the gates verdict no longer turns the run red for a kitchen run");
});
