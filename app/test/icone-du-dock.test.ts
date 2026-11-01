// L'icône du Dock : absente du bundle, elle ne fait pas échouer le démarrage.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { poserLIconeDuDock } from "../src/icone-du-dock.ts";

describe("l'icône du Dock", () => {
  test("posée quand le fichier existe", () => {
    const posees: string[] = [];
    assert.equal(poserLIconeDuDock("/i.png", (c) => posees.push(c), () => true), true);
    assert.deepEqual(posees, ["/i.png"]);
  });

  test("fichier absent : rien n'est posé, rien ne lève", () => {
    const posees: string[] = [];
    assert.equal(poserLIconeDuDock("/absente.png", (c) => posees.push(c), () => false), false);
    assert.deepEqual(posees, []);
  });

  test("un rejet de la pose est avalé", () => {
    assert.equal(poserLIconeDuDock("/i.png", () => { throw new Error("no such file"); }, () => true), false);
  });
});
