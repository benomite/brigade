// #3797 : une station qui cuit ou juge un ticket du projet le sert, même sans sélection écrite par l'app.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { avecLesStationsQuiCuisent } from "../../src/attente-du-rail/stations.ts";

const DEPOT = "benomite/brigade";
const station = (name: string, selection: readonly string[] | null) => ({ name, selection });

describe("avecLesStationsQuiCuisent", () => {
  test("une station qui cuit sans sélection reçoit le projet", () => {
    assert.deepEqual(avecLesStationsQuiCuisent([station("parade-box", null)], DEPOT, ["parade-box/claude"]), [station("parade-box", [DEPOT])]);
  });
  test("une station qui cuit et choisit un autre projet garde son choix et reçoit celui-ci", () => {
    assert.deepEqual(avecLesStationsQuiCuisent([station("parade-box", ["benomite/autre"])], DEPOT, ["parade-box/claude"]), [station("parade-box", ["benomite/autre", DEPOT])]);
  });
  test("une station qui sert déjà le projet, quelle que soit la casse, n'est pas touchée", () => {
    for (const choix of [DEPOT, "Benomite/Brigade"]) assert.deepEqual(avecLesStationsQuiCuisent([station("parade-box", [choix])], DEPOT, ["parade-box/claude"]), [station("parade-box", [choix])]);
  });
  test("une station qui ne cuit rien n'est pas touchée", () => {
    assert.deepEqual(avecLesStationsQuiCuisent([station("parade-box", null), station("autre", ["benomite/autre"])], DEPOT, ["parade-box/claude"]).map(({ selection }) => selection), [[DEPOT], ["benomite/autre"]]);
    assert.deepEqual(avecLesStationsQuiCuisent([station("autre", null)], DEPOT, ["parade-box/claude"]), [station("autre", null)]);
  });
});
