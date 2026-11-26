// #4339, critère 3 : un test automatique échoue si la règle de découpage, seuil de 30 minutes compris, est retirée du prompt du manager, et passe avec elle.
import assert from "node:assert/strict";
import { test } from "node:test";
import { consigneDeJugement } from "../../src/juger.ts";

const SEUIL = /\b30\s*(min|minutes)\b/i;
const DECOUPE = /(découp|scind|split)/i;
const porteLaRegle = (texte: string) => texte.split("\n").some((l) => SEUIL.test(l) && DECOUPE.test(l));

test("the splitting rule with its 30 minute threshold is present in the prompt, and the check goes red when it is removed", () => {
  const texte = consigneDeJugement({
    depot: "acme/brigade",
    issue: { number: 1, title: "Un ticket", body: "Un corps.", labels: [] },
    commentaires: [],
  });
  assert.ok(porteLaRegle(texte), "the prompt carries the splitting rule with the 30 minute threshold");
  const sansRegle = texte
    .split("\n")
    .filter((l) => !(SEUIL.test(l) && DECOUPE.test(l)))
    .join("\n");
  assert.ok(!porteLaRegle(sansRegle), "without the rule line, the check fails");
  const sansSeuil = texte.replace(/\b30(\s*)(min|minutes)\b/gi, "45$1$2");
  assert.ok(!porteLaRegle(sansSeuil), "without the 30 minute threshold, the check fails");
});
