// Un projet que le fichier des projets ne dit pas cuit sur cet ordinateur se lit dès qu'une station d'ailleurs le sert (#1405).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { serviAilleurs, type ProjetVu } from "../../src/projets/projets.ts";

const vu = (cuitSur: ProjetVu["cuitSur"]) => ({ projets: [{ nom: "mirrorscreen", cuitSur } as ProjetVu] });

describe("serviAilleurs", () => {
  test("vrai quand une station qui n'est pas celle de cet ordinateur sert le projet", () => {
    assert.equal(serviAilleurs(vu({ id: "g1", nom: "parade-box/claude", ici: false }), "mirrorscreen"), true);
    assert.equal(serviAilleurs(vu({ id: "g1", nom: "parade-box", ici: false }), "mirrorscreen"), true);
  });
  test("faux quand aucune station ne le sert, quand c'est cet ordinateur, ou quand le projet est inconnu", () => {
    assert.equal(serviAilleurs(vu(null), "mirrorscreen"), false);
    assert.equal(serviAilleurs(vu({ id: "g1", nom: "mac/claude", ici: true }), "mirrorscreen"), false);
    assert.equal(serviAilleurs(vu({ id: "g1", nom: "box/claude", ici: false }), "autre"), false);
    assert.equal(serviAilleurs(undefined, "mirrorscreen"), false);
  });
});
