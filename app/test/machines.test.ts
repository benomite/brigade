// La machine que « + shell » propose : ce poste, et lui seul.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { placeOf, machineChosen, machinesOf } from "../src/machines.ts";
import { HERE } from "../src/platform.ts";

describe("les machines proposées par « + shell »", () => {
  test("ce poste seul", () => {
    assert.deepEqual(machinesOf(), [{ id: "poste", titre: HERE, cible: { lieu: "poste" } }]);
  });

  test("la vue choisit par l'identifiant : une machine qui n'est pas proposée n'est pas choisie", () => {
    const machines = machinesOf();
    assert.deepEqual(machineChosen(machines, "poste")?.cible, { lieu: "poste" });
    for (const other of ["station:ailleurs", "parade-box", undefined, 3]) assert.equal(machineChosen(machines, other), undefined);
  });

  test("où est un shell, dit comme la liste le dit", () => {
    assert.equal(placeOf({ lieu: "poste" }), HERE);
  });
});
