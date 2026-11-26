// #4339, critère 2 : la règle dit que chaque ticket issu du découpage a ses propres critères d'acceptation, vérifiables chacun isolément.
import assert from "node:assert/strict";
import { test } from "node:test";
import { consigneDeJugement } from "../../src/juger.ts";

test("the splitting rule says each resulting ticket has its own acceptance criteria, each checkable on its own", () => {
  const texte = consigneDeJugement({
    depot: "acme/brigade",
    issue: { number: 1, title: "Un ticket", body: "Un corps.", labels: [] },
    commentaires: [],
  });
  const lignes = texte.split("\n");
  const i = lignes.findIndex((l) => /\b30\s*(min|minutes)\b/i.test(l));
  assert.notEqual(i, -1, "the prompt states the splitting rule with its 30 minute threshold");
  const regle = lignes.slice(Math.max(0, i - 4), i + 6).join("\n");
  assert.match(regle, /(chaque|each)[^\n]*ticket/i, "each resulting ticket is addressed");
  assert.match(regle, /(ses propres|leurs propres|its own|their own)[^\n]*(critères d'acceptation|acceptance criteria)|(critères d'acceptation|acceptance criteria)[^\n]*(propres|own)/i, "each ticket has its own acceptance criteria");
  assert.match(regle, /(vérifi|check|verif)[^\n]*(seul|isolé|indépendam|separately|on its own|on their own|alone|independently)|(seul|isolé|indépendam|separately|on its own|alone|independently)[^\n]*(vérifi|check|verif)/i, "each criterion can be checked on its own");
});
