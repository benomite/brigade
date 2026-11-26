// Chaque mot d'état que l'app affiche vient d'une seule table (slip.ts) : tout état connu y a son mot
// anglais, aucun mot français ne s'affiche, et la vue comme le rail publié n'en gardent pas de copie.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { MOTS_DE_CARD, MOTS_DE_KITCHEN, wordDState } from "../src/slip.ts";
import { TONS_DE_PROJECT, TONS_DE_TICKET } from "../src/facts.ts";

const FRANCAIS = ["pris", "en attente", "en pass", "servi", "ouverte", "retenue", "arrêtée", "éteinte"];
const VUE = join(import.meta.dirname, "../src/vue");

describe("les mots d'état, en anglais, d'une seule table", () => {
  test("tout état connu d'une carte ou d'une cuisine a son mot anglais", () => {
    for (const state of TONS_DE_TICKET.keys()) assert.ok(MOTS_DE_CARD[state] !== undefined, `« ${state} » n'a pas de mot`);
    for (const state of TONS_DE_PROJECT.keys()) assert.ok(MOTS_DE_KITCHEN[state] !== undefined, `« ${state} » n'a pas de mot`);
    for (const state of [...Object.keys(MOTS_DE_CARD), ...Object.keys(MOTS_DE_KITCHEN)]) {
      const word = wordDState(state);
      assert.ok(!FRANCAIS.includes(word) && /^[A-Za-z0-9 ]+$/.test(word), `« ${state} » s'affiche « ${word} »`);
    }
    assert.equal(wordDState("pris"), "taken");
    assert.equal(wordDState("ouverte"), "open");
    assert.equal(wordDState("un mot inconnu"), "un mot inconnu");
  });

  test("la vue et le rail publié ne gardent aucune copie de la table", () => {
    for (const fichier of ["vue.js", "rail-published.js"]) {
      const source = readFileSync(join(VUE, fichier), "utf8");
      assert.ok(!/["'`](pris|en attente|en pass|servi|ouverte|retenue|arrêtée|éteinte)["'`]\s*[:)]?\s*[?:]\s*["'`](taken|queued|open)/.test(source), fichier);
      assert.ok(!/"86"\s*\?\s*"set aside"/.test(source), `${fichier} traduit « 86 »`);
    }
  });
});
