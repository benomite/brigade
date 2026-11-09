// Le tour d'une station GitHub lance l'alerte du temps de cuisson (#2676) :
// les rapports et le seuil se lisent dans le clone du projet, et un seul
// ticket de correction s'ouvre.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { MARQUE_CORRECTION } from "../../src/alerte-temps-cuisson/alerte.ts";
import { fauxDuTour, stationQuiTourne } from "../faux-github.ts";
import { repertoireTemporaire } from "../outils.ts";

// Un clone dont les tickets servis ont cuit `[attendu, réel]` minutes, au format
// que #2675 écrit dans ratios-cuisson.json.
function clone(tc: TestContext, cuissons: [number, number][], projet: string = "{}"): string {
  const depot = repertoireTemporaire(tc);
  const dossier = join(depot, ".claude", "brigade");
  mkdirSync(dossier, { recursive: true });
  writeFileSync(join(dossier, "projet.json"), projet);
  const ratios = cuissons.map(([attendu, reel], rang) => ({ ticket: 2600 + rang, servedAt: new Date(Date.UTC(2026, 10, 7, rang)).toISOString(), attendu, reel, ratio: reel / attendu }));
  writeFileSync(join(dossier, "ratios-cuisson.json"), JSON.stringify(ratios));
  return depot;
}

test("over cookingOverEstimateMax, the station's turn opens one cooking-time correction ticket, and no second one while it is open", async (tc) => {
  const { issues, github } = fauxDuTour();
  const avertis: string[] = [];
  const s = stationQuiTourne(github, clone(tc, [[10, 30], [10, 20], [5, 20]]), avertis);
  await s.tour();
  await s.tour();
  await stationQuiTourne(github, clone(tc, [[10, 30], [10, 20], [5, 20]]), avertis).tour();
  assert.deepEqual(avertis, []);
  const ouvertes = issues.filter((i) => i.body.startsWith(MARQUE_CORRECTION));
  assert.equal(ouvertes.length, 1);
  assert.match(ouvertes[0]?.body ?? "", /\| #2602 \| 5 min \| 20 min \| ×4\.00 \|\n\| #2600 \| 10 min \| 30 min \| ×3\.00 \|/);
});

test("the project's own cookingOverEstimateMax holds in the turn: under it, nothing opens", async (tc) => {
  const { issues, github } = fauxDuTour();
  const avertis: string[] = [];
  await stationQuiTourne(github, clone(tc, [[10, 30], [10, 20], [5, 20]], JSON.stringify({ cookingOverEstimateMax: 4 })), avertis).tour();
  assert.deepEqual(avertis, []);
  assert.equal(issues.filter((i) => i.body.startsWith(MARQUE_CORRECTION)).length, 0);
});

test("a malformed projet.json is said once, not at every turn, and the default threshold still holds", async (tc) => {
  const { issues, github } = fauxDuTour();
  const avertis: string[] = [];
  const s = stationQuiTourne(github, clone(tc, [[10, 30], [10, 20], [5, 20]], "{ not json"), avertis);
  await s.tour();
  await s.tour();
  assert.equal(avertis.filter((texte) => texte.includes("cookingOverEstimateMax falls back to 1.5")).length, 1);
  assert.equal(issues.filter((i) => i.body.startsWith(MARQUE_CORRECTION)).length, 1);
});
