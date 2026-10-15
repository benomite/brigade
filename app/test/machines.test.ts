// Les machines que « + shell » propose : ce poste, la box, et chaque station que la box déclare —
// sous le nom que le chef leur connaît —, et l'hôte que chacune fait joindre.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { lieuDe, machineChoisie, machinesDe } from "../src/machines.ts";

const PARADE = { box: { hote: "parade-box" }, stations: ["mac/claude"] };

describe("les machines proposées par « + shell »", () => {
  test("un projet sans box : ce poste seul", () => {
    assert.deepEqual(machinesDe({}), [{ id: "poste", titre: "this Mac", cible: { lieu: "poste" } }]);
  });

  test("un projet servi, avant que sa box ait dit ses stations : ce poste, et la box sous le nom que son `ssh` connaît", () => {
    assert.deepEqual(machinesDe({ box: { hote: "parade-box" } }), [
      { id: "poste", titre: "this Mac", cible: { lieu: "poste" } },
      { id: "box", titre: "box parade-box", cible: { lieu: "box", nom: "parade-box", hote: "parade-box" } },
    ]);
  });

  test("chaque station déclarée est proposée, sur la machine qui la fait tourner : celle de la box est la box, celle que ce poste joue est ce poste, les autres sont jointes par leur nom de machine", () => {
    const declarees = [
      { nom: "box/claude", distante: false },
      { nom: "mac/claude", distante: true },
      { nom: "studio/claude", distante: true },
      { nom: "atelier/claude", distante: true },
      { nom: "studio/codex", distante: true },
    ];
    assert.deepEqual(machinesDe(PARADE, declarees), [
      { id: "poste", titre: "this Mac — station mac/claude", cible: { lieu: "poste" } },
      { id: "box", titre: "box parade-box — station box/claude", cible: { lieu: "box", nom: "parade-box", hote: "parade-box" } },
      // Deux stations d'une même machine n'en font qu'une.
      { id: "station:studio", titre: "station studio/claude, studio/codex", cible: { lieu: "station", nom: "studio", hote: "studio" } },
      { id: "station:atelier", titre: "station atelier/claude", cible: { lieu: "station", nom: "atelier", hote: "atelier" } },
    ]);
  });

  test("la vue choisit par l'identifiant : une machine qui n'est plus proposée n'est pas choisie", () => {
    const machines = machinesDe(PARADE, [{ nom: "studio/claude", distante: true }]);
    assert.deepEqual(machineChoisie(machines, "station:studio")?.cible, { lieu: "station", nom: "studio", hote: "studio" });
    for (const autre of ["station:ailleurs", "parade-box", undefined, 3]) assert.equal(machineChoisie(machines, autre), undefined);
  });

  test("où est un shell, dit comme la liste le dit", () => {
    assert.equal(lieuDe({ lieu: "poste" }), "this Mac");
    assert.equal(lieuDe({ lieu: "box", nom: "parade-box", hote: "parade-box" }), "box parade-box");
    assert.equal(lieuDe({ lieu: "station", nom: "studio", hote: "studio" }), "station studio");
  });
});
