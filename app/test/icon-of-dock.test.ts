// L'icône du Dock : absente du bundle, elle ne fait pas échouer le démarrage.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { setTheIconOfDock } from "../src/icon-of-dock.ts";

describe("l'icône du Dock", () => {
  test("posée quand le fichier existe", () => {
    const setEntries: string[] = [];
    assert.equal(setTheIconOfDock("/i.png", (c) => setEntries.push(c), () => true), true);
    assert.deepEqual(setEntries, ["/i.png"]);
  });

  test("fichier absent : rien n'est posé, rien ne lève", () => {
    const setEntries: string[] = [];
    assert.equal(setTheIconOfDock("/absente.png", (c) => setEntries.push(c), () => false), false);
    assert.deepEqual(setEntries, []);
  });

  test("un rejet de la pose est avalé", () => {
    assert.equal(setTheIconOfDock("/i.png", () => { throw new Error("no such file"); }, () => true), false);
  });
});
