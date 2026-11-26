// #4339 : le prompt du manager porte la règle de découpage, seuil de 30 minutes compris.
import assert from "node:assert/strict";
import { test } from "node:test";
import { consigneDeJugement } from "../src/juger.ts";

const mission = { depot: "acme/brigade", issue: { number: 1, title: "Un ticket", body: "Un corps.", labels: [] }, commentaires: [] };

test("the judging prompt carries the splitting rule: several independent deliverables or about 30 minutes of cook work", () => {
  const texte = consigneDeJugement(mission);
  assert.match(texte, /plus d'un livrable indépendant, ou dont le travail du cook dépasse environ 30 minutes, se découpe en tickets séparés/);
  assert.match(texte, /qualifie-le `epic`/);
});

test("the splitting rule gives each resulting ticket its own acceptance criteria, each checked on its own", () => {
  const texte = consigneDeJugement(mission);
  assert.match(texte, /Chaque ticket issu du découpage a ses propres critères d'acceptation, et chacun de ces critères se vérifie seul/);
});
