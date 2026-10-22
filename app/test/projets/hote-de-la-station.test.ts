// Un projet ajouté depuis l'app n'a pas d'`hote` dans le fichier : sa box est la machine de la station qui le sert (#1405).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { hoteDeLaStation, type ProjetVu } from "../../src/projets/projets.ts";

const vu = (cuitSur: ProjetVu["cuitSur"]) => ({ projets: [{ nom: "mirrorscreen", cuitSur } as ProjetVu] });

describe("hoteDeLaStation", () => {
  test("la machine de la station qui sert le projet", () => {
    assert.equal(hoteDeLaStation(vu({ id: "g1", nom: "parade-box/claude", ici: false }), "mirrorscreen"), "parade-box");
    assert.equal(hoteDeLaStation(vu({ id: "g1", nom: "parade-box", ici: false }), "mirrorscreen"), "parade-box");
  });
  test("rien quand aucune station ne le sert, quand c'est cet ordinateur, ou quand le projet est inconnu", () => {
    assert.equal(hoteDeLaStation(vu(null), "mirrorscreen"), undefined);
    assert.equal(hoteDeLaStation(vu({ id: "g1", nom: "mac/claude", ici: true }), "mirrorscreen"), undefined);
    assert.equal(hoteDeLaStation(vu({ id: "g1", nom: "box/claude", ici: false }), "autre"), undefined);
    assert.equal(hoteDeLaStation(undefined, "mirrorscreen"), undefined);
  });
  test("un nom que ssh lirait comme une option n'est pas un hôte", () => {
    assert.equal(hoteDeLaStation(vu({ id: "g1", nom: "-oProxyCommand=x/claude", ici: false }), "mirrorscreen"), undefined);
  });
});
