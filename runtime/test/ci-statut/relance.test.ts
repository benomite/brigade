// #3952 : un run de la cuisine finit vert, son vrai verdict en statuts de commit. Le relancer, c'est le relancer en
// entier : « relancer les jobs en échec » n'y relancerait rien, et le statut du check ne bougerait pas.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { ouvrirGitHub } from "../../src/github.ts";
import { DEPOT, fauxGh } from "../outils.ts";

function sonde(t: TestContext) {
  const gh = fauxGh(t);
  return { gh, github: ouvrirGitHub({ depot: DEPOT, bin: gh.bin }) };
}

test("a run that ended green with a failing status is rerun whole; a red run reruns only its failed jobs", async (t) => {
  const { gh, github } = sonde(t);
  gh.repondre(`repos/${DEPOT}/actions/runs/123`, { corps: { conclusion: "success" } });
  gh.repondre(`repos/${DEPOT}/actions/runs/123/rerun`, { statut: 201, corps: {} });
  gh.repondre(`repos/${DEPOT}/actions/runs/124`, { corps: { conclusion: "failure" } });
  gh.repondre(`repos/${DEPOT}/actions/runs/124/rerun-failed-jobs`, { statut: 201, corps: {} });

  await github.relancerLesEchecs(123);
  assert.deepEqual(gh.appels(), [["api", "-i", `repos/${DEPOT}/actions/runs/123`], ["api", "-i", "-X", "POST", `repos/${DEPOT}/actions/runs/123/rerun`]]);
  await github.relancerLesEchecs(124);
  assert.deepEqual(gh.appels().slice(2), [["api", "-i", `repos/${DEPOT}/actions/runs/124`], ["api", "-i", "-X", "POST", `repos/${DEPOT}/actions/runs/124/rerun-failed-jobs`]]);
});

test("a run that cannot be read is not rerun: the refusal is raised", async (t) => {
  const { gh, github } = sonde(t);
  gh.repondre(`repos/${DEPOT}/actions/runs/125`, { statut: 404, corps: { message: "Not Found" } });

  await assert.rejects(github.relancerLesEchecs(125), /HTTP 404/);
  assert.deepEqual(gh.appels(), [["api", "-i", `repos/${DEPOT}/actions/runs/125`]]);
});
