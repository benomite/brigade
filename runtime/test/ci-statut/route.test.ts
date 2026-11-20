// #3952 : la route de relance d'un run se choisit sur sa conclusion. Un run fini vert (celui de la cuisine, son vrai
// verdict en statuts) se relance en entier ; tout autre run, rouge ou sans conclusion, ne relance que ses jobs en échec.
import assert from "node:assert/strict";
import { test } from "node:test";
import { routeDeRelance } from "../../src/ci-statut/relance.ts";

test("a green run is rerun whole; a red run, or one with no conclusion, reruns only its failed jobs", () => {
  assert.equal(routeDeRelance("o/d", 9, "success"), "repos/o/d/actions/runs/9/rerun");
  assert.equal(routeDeRelance("o/d", 9, "failure"), "repos/o/d/actions/runs/9/rerun-failed-jobs");
  assert.equal(routeDeRelance("o/d", 9, null), "repos/o/d/actions/runs/9/rerun-failed-jobs");
});
