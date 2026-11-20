// #3952, critère 3 : sur un push sur `main` avec un test en échec, le run est vert et le statut du commit est failure.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const WORKFLOW = readFileSync(new URL("../../../.github/workflows/tests.yml", import.meta.url), "utf8").replace(/^\s*#.*$/gm, "");

test("a push to main posts its status on github.sha and no step turns the run red", () => {
  assert.match(WORKFLOW, /push:\s*\n\s*branches: \[[^\]]*main/, "main push still triggers the tests");
  assert.match(WORKFLOW, /statuses\/\$\{\{ github\.sha \}\}|statuses\/\$GITHUB_SHA|statuses\/\$SHA/, "the status lands on the pushed commit");
  assert.match(WORKFLOW, /statuses: write/, "the workflow may write commit statuses");
  const rouge = WORKFLOW.split("\n").filter((ligne) => /^\s*(?!#)[^#]*\bexit 1\b/.test(ligne) || /exit "\"/.test(ligne));
  assert.deepEqual(rouge, [], "no unconditional step ends the job red on a kitchen event");
});
