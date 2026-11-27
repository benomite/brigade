// Pourquoi la file du rail ne part pas, dans l'app (ticket 3433) : ce que `facts` porte de la phrase du runtime et de la
// ligne de chaque carte, la ligne d'une carte en file, et la ligne en tête du rail.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { queuedLine, READY } from "../../src/line-card.ts";
import { waitOfRailRead, linesOfCardsRead } from "../../src/vue/wait-of-rail/wait-of-rail.ts";
import { lineOfTheWait } from "../../src/vue/wait-of-rail/line-of-the-wait.js";
import { Fake } from "../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) };

describe("`facts` porte la phrase et les lignes des cartes", () => {
  test("un `attenteDuRail` ou des `lignesDesCartes` mal formés ne sont pas posés", () => {
    for (const raw of [null, [], { raison: "inconnue", phrase: "x", geste: null }, { raison: "normale", phrase: "", geste: null }, { raison: "normale", phrase: "x", geste: "autre" }, { raison: "normale", phrase: "x" }]) {
      assert.deepEqual(waitOfRailRead(raw), {}, JSON.stringify(raw));
    }
    for (const raw of [null, [], {}, { x: "waits for #4 — read from the card" }, { 5: "" }, { 5: 4 }]) assert.deepEqual(linesOfCardsRead(raw), {}, JSON.stringify(raw));
    assert.deepEqual(linesOfCardsRead({ 5: "waits for #4 — read from the card" }), { lignesDesCartes: { 5: "waits for #4 — read from the card" } });
  });
});

describe("la ligne de chaque carte en file", () => {
  test("ce qui retient déjà la carte passe avant", () => {
    const behind = { ligne: "waits for #4 — read from the card", attendus: [4] };
    assert.deepEqual(queuedLine("en attente", "blocked by #9", behind), { ligne: "Waiting for #9", liens: [9] });
    assert.deepEqual(queuedLine("en attente", undefined, behind), { ligne: "waits for #4 — read from the card", liens: [4] });
    assert.deepEqual(queuedLine("en attente", undefined, undefined), { ligne: READY });
  });
});

describe("la ligne en tête du rail", () => {
  test("sans attente : aucune ligne", () => {
    assert.deepEqual(lineOfTheWait(doc, undefined, null), []);
  });
});
