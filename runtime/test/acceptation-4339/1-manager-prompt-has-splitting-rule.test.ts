// #4339, critère 1 : le prompt du manager qui juge et dimensionne les tickets porte une règle explicite de découpage.
import assert from "node:assert/strict";
import { test } from "node:test";
import { consigneDeJugement } from "../../src/juger.ts";

test("the manager's judging prompt says a ticket with several independent deliverables, or over about 30 minutes of cook work, is split", () => {
  const texte = consigneDeJugement({
    depot: "acme/brigade",
    issue: { number: 1, title: "Un ticket", body: "Un corps.", labels: [] },
    commentaires: [],
  });
  const lignes = texte.split("\n");
  const i = lignes.findIndex((l) => /\b30\s*(min|minutes)\b/i.test(l));
  assert.notEqual(i, -1, "the prompt states the 30 minute threshold");
  const regle = lignes.slice(Math.max(0, i - 3), i + 4).join("\n");
  assert.match(regle, /(découp|scind|sépar|split)/i, "the rule says to split");
  assert.match(regle, /(plus d'un|plusieurs|more than one|several|multiple)[^\n]*(livrable|deliverable)/i, "the rule names several deliverables");
  assert.match(regle, /(indépendant|independent)/i, "the deliverables are independent");
});
