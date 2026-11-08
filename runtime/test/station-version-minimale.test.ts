import assert from "node:assert/strict";
import { test } from "node:test";
import { avertirSiTropAncienne, avertissementVersion, VERSION_MINIMALE } from "../src/station/version-minimale.ts";

const MINIMUM = "0.20261108.111043";

function demarrer(version: string): string[] {
  const lignes: string[] = [];
  avertirSiTropAncienne(version, (ligne) => lignes.push(ligne), MINIMUM);
  return lignes;
}

test("une version plus ancienne que le minimum : une seule ligne, qui nomme la version requise", () => {
  const lignes = demarrer("0.20261108.084419+g6e89903");
  assert.equal(lignes.length, 1);
  assert.ok(lignes[0]?.includes(MINIMUM));
  assert.ok(!lignes[0]?.includes("\n"));
});

test("une version égale ou plus récente que le minimum : aucune ligne", () => {
  assert.deepEqual(demarrer(MINIMUM), []);
  assert.deepEqual(demarrer("0.20261109.000001+gabc"), []);
});

test("une version illisible (poste de dev) : aucune ligne", () => {
  assert.deepEqual(demarrer("inconnue"), []);
});

test("le minimum livré est une version que la station sait comparer", () => {
  assert.equal(avertissementVersion(VERSION_MINIMALE), null);
});
