// How a name is translated, on the edges the app's rename found (#4413): a
// one-word constant, and a name of one letter.
import assert from "node:assert/strict";
import { test } from "node:test";
import { WORDS } from "../table.ts";
import { frenchIn, translate } from "../words.ts";

const translator = { words: WORDS };

test("a constant of one word keeps its capitals and gets an underscore between its English words", () => {
  assert.equal(translate("ALLUMAGE", translator), "POWER_UP");
  assert.equal(translate("RENVOYER", translator), "SEND_BACK");
  assert.equal(translate("EXEMPLE", translator), "EXAMPLE");
});

test("a name of one letter, with digits at most, is not French; beside another word, the letter is", () => {
  for (const name of ["d", "l", "L1", "l2"]) {
    assert.equal(translate(name, translator), name);
    assert.deepEqual(frenchIn(name, translator), []);
  }
  assert.equal(translate("ouvrirLEcran", translator), "openTheScreen");
});
