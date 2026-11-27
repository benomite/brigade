// La station que l'app lance reçoit sa source de mise à jour et sa relance par l'app (#2287, #2189).
// La relance que la mise à jour de l'ancien runtime demandait par une ligne de sa sortie est partie avec elle (#4499).
import assert from "node:assert/strict";
import { test } from "node:test";
import { environmentOfTheStation } from "../../src/station-process/supervisor.ts";

test("l'app donne à la station sa source de mise à jour et la relance par l'app — une source déjà dite est gardée, la relance ne se change pas", () => {
  assert.deepEqual(environmentOfTheStation({ A: "1" }), { BRIGADE_MISE_A_JOUR_SOURCE: "github:benomite/brigade", A: "1", BRIGADE_STATION_RELANCE: "app" });
  assert.deepEqual(environmentOfTheStation({ BRIGADE_MISE_A_JOUR_SOURCE: "/essai", BRIGADE_STATION_RELANCE: "box" }), { BRIGADE_MISE_A_JOUR_SOURCE: "/essai", BRIGADE_STATION_RELANCE: "app" });
});
