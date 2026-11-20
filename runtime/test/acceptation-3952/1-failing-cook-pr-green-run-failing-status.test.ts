// #3952, critère 1 : sur une PR d'une branche `cook/*` dont un test échoue, le run GitHub est vert, et le commit porte
// un statut en échec pour ce check, avec un lien vers le job en échec.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const WORKFLOW = readFileSync(new URL("../../../.github/workflows/tests.yml", import.meta.url), "utf8").replace(/^\s*#.*$/gm, "");

test("the workflow covers cook/* PRs, runs the tests without failing the run, and posts a failure status linking the job", () => {
  assert.match(WORKFLOW, /cook\//, "cook/* branches are named in the workflow's triggers");
  assert.match(WORKFLOW, /statuses: write/, "the workflow may write commit statuses");
  assert.match(WORKFLOW, /repos\/$\{\{ github\.repository \}\}\/statuses\/|\/statuses\/\$/, "the status is posted through the commit statuses API");
  assert.match(WORKFLOW, /target_url/, "the status links to the job");
  assert.match(WORKFLOW, /state=failure|"failure"|'failure'|failure/, "a failing check posts the failure state");
  assert.match(WORKFLOW, /continue-on-error|\|\| true|exit 0/, "the red test does not make the run red");
});
