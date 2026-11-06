// La clôture traite un décompte non nul de blocages sans question comme un défaut.
import assert from "node:assert/strict";
import { test } from "node:test";
import { defautDesBlocagesSansQuestion } from "../src/cloture-blocages.ts";

test("à zéro blocage sans question, aucun défaut", () => {
  assert.equal(defautDesBlocagesSansQuestion({ blockedWithoutQuestion: 0 }), null);
});

test("au-dessus de zéro, un défaut dont le titre nomme le décompte", () => {
  const defaut = defautDesBlocagesSansQuestion({ blockedWithoutQuestion: 3 });
  assert.ok(defaut);
  assert.match(defaut.title, /\b3\b/);
});
