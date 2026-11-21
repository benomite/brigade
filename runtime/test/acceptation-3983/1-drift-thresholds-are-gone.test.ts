// #3983, critère 1 : les seuils de dérive (ligne 8b) ne sont plus dans les réglages, les lecteurs, la liste des plafonds de l'app ni les docs.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { SEUILS_DU_PROJET } from "../../src/reglages-projet/reglages.ts";

const RACINE = join(import.meta.dirname, "../../..");
const CLES = ["tests", "testsSeconds", "contextKb", "repoMb", "merges", "growthPercent", "firstTryPercent", "firstTryWindow"];
const VARIABLES = ["BRIGADE_DRIFT_TESTS", "BRIGADE_DRIFT_TESTS_SECONDS", "BRIGADE_DRIFT_CONTEXT_KB", "BRIGADE_DRIFT_REPO_MB", "BRIGADE_DRIFT_MERGES", "BRIGADE_DRIFT_GROWTH_PERCENT", "BRIGADE_DRIFT_FIRST_TRY_PERCENT", "BRIGADE_DRIFT_FIRST_TRY_WINDOW"];

test("the drift thresholds are listed in neither the settings, the app caps list nor the settings doc", () => {
  const restes = CLES.filter((cle) => cle in SEUILS_DU_PROJET.drift);
  assert.deepEqual(restes, [], "settings still declare drift thresholds");

  const caps = readFileSync(join(RACINE, "app/src/plafonds-duree.ts"), "utf8");
  const doc = readFileSync(join(RACINE, "docs/reglages.md"), "utf8");
  for (const cle of CLES) {
    assert.ok(!caps.includes(`cle: "${cle}"`), `app caps list still has ${cle}`);
    assert.ok(!doc.includes(`\`drift.${cle}\``), `docs/reglages.md still documents drift.${cle}`);
  }
  for (const variable of VARIABLES) assert.ok(!doc.includes(variable), `docs/reglages.md still names ${variable}`);
});
