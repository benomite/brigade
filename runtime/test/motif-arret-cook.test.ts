import assert from "node:assert/strict";
import { test } from "node:test";
import { motifArretCook } from "../src/motif-arret-cook.ts";

const RAISONS = ["the cook added nothing since its last delivery", "the cook committed nothing"] as const;
const [RIEN_AJOUTE, RIEN_COMMITE] = RAISONS;

test("a stopped cook's comment carries its last message, its turns and its exit code", () => {
  const texte = motifArretCook(RIEN_AJOUTE, { message: "all remarks are already addressed", turns: 6, code: 0 });
  assert.match(texte, /all remarks are already addressed/);
  assert.match(texte, /6 turns/);
  assert.match(texte, /exit code 0/);
});

test("a non-zero exit code is shown", () => {
  assert.match(motifArretCook(RIEN_COMMITE, { message: "blocked", turns: 3, code: 2 }), /exit code 2/);
});

test("a cook with no last message says so", () => {
  for (const message of [null, "", "  \n"]) {
    assert.match(motifArretCook(RIEN_COMMITE, { message, turns: 1, code: 0 }), /no last message/);
  }
});

test("no variant is only the turn count", () => {
  for (const raison of RAISONS) {
    const texte = motifArretCook(raison, { message: null, turns: 6, code: 0 });
    assert.ok(texte.startsWith(raison));
    assert.notEqual(texte, `${raison} (6 turns)`);
    assert.match(texte, /exit code 0/);
    assert.match(texte, /no last message/);
  }
});
