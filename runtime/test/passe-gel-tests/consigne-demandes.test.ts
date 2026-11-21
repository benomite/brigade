import assert from "node:assert/strict";
import { test } from "node:test";
import { consigneDeRelecture, type Relecture } from "../../src/reviewer.ts";

const FICHIER = "test/a.test.ts";
const DIFF = `diff --git a/${FICHIER} b/${FICHIER}\n--- a/${FICHIER}\n+++ b/${FICHIER}\n@@ -1 +1 @@\n+// brigade:guard\n`;
const mission = (extra: Partial<Relecture>): Relecture => ({ depot: "o/r", base: "main", ticket: { number: 1, title: "t", body: "b" }, commentaires: [], compteRendu: null, diff: { fichiers: ["a.ts"], texte: "+x" }, criteres: [], testsGeles: { fichiers: [FICHIER], diff: DIFF }, ...extra });

test("a frozen test changed without a request is judged, and the brief quotes no request", () => {
  const consigne = consigneDeRelecture(mission({}));
  assert.match(consigne, /c'est un constat `bloquant`/);
  assert.match(consigne, /sauf le geste que le manager lui demande/);
  assert.doesNotMatch(consigne, /Le manager a demandé/);
  assert.doesNotMatch(consigne, /Ce que le manager a demandé/);
});

test("a frozen test changed as the manager asked is said not to be blocking, with the request quoted", () => {
  const consigne = consigneDeRelecture(mission({ demandesDuManager: [`Add \`// brigade:guard\` in \`${FICHIER}\`.`] }));
  assert.doesNotMatch(consigne, /c'est un constat `bloquant`/);
  assert.match(consigne, /Le manager a demandé le changement de `test\/a\.test\.ts`/);
  assert.match(consigne, /> Add `\/\/ brigade:guard`/);
});

test("with an unreadable history, the brief still names the exception and quotes the request", () => {
  const consigne = consigneDeRelecture(mission({ testsGeles: { illisible: "boom" }, demandesDuManager: ["Add `x`."] }));
  assert.match(consigne, /sauf ce que le manager a demandé/);
  assert.match(consigne, /> Add `x`\./);
});

test("with two frozen tests changed, only the one that goes beyond the request is judged, and only its diff is shown", () => {
  const autre = "test/b.test.ts";
  const diff = `${DIFF}diff --git a/${autre} b/${autre}\n--- a/${autre}\n+++ b/${autre}\n@@ -1 +1 @@\n+assert.ok(true);\n`;
  const consigne = consigneDeRelecture(mission({ testsGeles: { fichiers: [FICHIER, autre], diff }, demandesDuManager: [`Add \`// brigade:guard\` in \`${FICHIER}\`.`] }));
  assert.match(consigne, /change le test gelé `test\/b\.test\.ts` : c'est un constat `bloquant`/);
  assert.match(consigne, /Le manager a demandé le changement de `test\/a\.test\.ts`/);
  assert.ok(consigne.includes("+assert.ok(true);"));
  assert.ok(!consigne.includes("```diff\ndiff --git a/test/a.test.ts"));
});
