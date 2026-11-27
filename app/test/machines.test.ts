// La machine que « + shell » propose : ce poste, et lui seul.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { lieuDe, machineChoisie, machinesDe } from "../src/machines.ts";
import { ICI } from "../src/plateforme.ts";

describe("les machines proposées par « + shell »", () => {
  test("ce poste seul", () => {
    assert.deepEqual(machinesDe(), [{ id: "poste", titre: ICI, cible: { lieu: "poste" } }]);
  });

  test("la vue choisit par l'identifiant : une machine qui n'est pas proposée n'est pas choisie", () => {
    const machines = machinesDe();
    assert.deepEqual(machineChoisie(machines, "poste")?.cible, { lieu: "poste" });
    for (const autre of ["station:ailleurs", "parade-box", undefined, 3]) assert.equal(machineChoisie(machines, autre), undefined);
  });

  test("où est un shell, dit comme la liste le dit", () => {
    assert.equal(lieuDe({ lieu: "poste" }), ICI);
  });
});
