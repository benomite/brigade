// #3952, critère 5 : la relance d'un check en échec par le second met à jour le statut du même nom de check, et aucune
// autre source de mail n'est ajoutée.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

const DOSSIER = new URL("../../../.github/workflows/", import.meta.url);
const WORKFLOW = readFileSync(new URL("tests.yml", DOSSIER), "utf8").replace(/^\s*#.*$/gm, "");

test("the status context is the stable name of the check, never tied to a run or an attempt", () => {
  const contextes = WORKFLOW.match(/context[=:]\s*[^\n]*/g) ?? [];
  assert.ok(contextes.length > 0, "the workflow posts a status under a context");
  for (const ligne of contextes) assert.doesNotMatch(ligne, /run_id|run_attempt|run_number|github\.run/, ligne);
});

test("no other mail source is added: no new trigger, no mail, no comment, no issue", () => {
  assert.doesNotMatch(WORKFLOW, /workflow_run:|issue_comment:|schedule:/);
  assert.doesNotMatch(WORKFLOW, /gh (issue|pr) (create|comment)|sendmail|smtp|notify/i);
  const fichiers = readdirSync(DOSSIER).filter((nom) => nom.endsWith(".yml")).sort();
  assert.deepEqual(fichiers, ["android.yml", "app-release-linux.yml", "app-windows.yml", "pages.yml", "publier-app.yml", "publier-station.yml", "retention-releases.yml", "runtime-windows.yml", "tests.yml"]);
  assert.match(WORKFLOW, /statuses: write/, "the status is the one channel that reports the result");
});
