import assert from "node:assert/strict";
import { test } from "node:test";
import { MARQUEUR_MANAGER } from "../../src/juger.ts";
import { demandeTenue, demandesDuManagerDans, diffParFichier } from "../../src/passe-gel-tests/demande-du-manager.ts";

const FICHIER = "test/a.test.ts";
const DEMANDE = "Add `// brigade:guard` in `test/a.test.ts`.";
const diff = (...lignes: string[]) => `diff --git a/${FICHIER} b/${FICHIER}\n--- a/${FICHIER}\n+++ b/${FICHIER}\n@@ -1 +1 @@\n${lignes.join("\n")}\n`;

test("the diff is split by file", () => {
  const deux = `${diff("+x")}diff --git a/b.ts b/b.ts\n+y\n`;
  assert.deepEqual([...diffParFichier(deux).keys()], [FICHIER, "b.ts"]);
});

test("a request met to the letter is held", () => {
  assert.equal(demandeTenue(FICHIER, diff("+// brigade:guard"), [DEMANDE]), true);
});

test("no request, or a request that does not name the file, holds nothing", () => {
  assert.equal(demandeTenue(FICHIER, diff("+// brigade:guard"), []), false);
  assert.equal(demandeTenue(FICHIER, diff("+// brigade:guard"), ["Add `// brigade:guard` elsewhere."]), false);
});

test("an added line the request does not quote, or a removed line, is beyond the request", () => {
  assert.equal(demandeTenue(FICHIER, diff("+// brigade:guard", "+assert.ok(true);"), [DEMANDE]), false);
  assert.equal(demandeTenue(FICHIER, diff("-old", "+// brigade:guard"), [DEMANDE]), false);
  assert.equal(demandeTenue(FICHIER, diff("-old"), [DEMANDE]), false);
  assert.equal(demandeTenue(FICHIER, "", [DEMANDE]), false);
});

test("only the manager's comments from an account with a hand on the repository are requests", () => {
  const lus = demandesDuManagerDans([
    { body: `${MARQUEUR_MANAGER}\nA`, association: "OWNER" },
    { body: `${MARQUEUR_MANAGER}\nB`, association: "NONE" },
    { body: "C", association: "OWNER" },
  ]);
  assert.deepEqual(lus, [`${MARQUEUR_MANAGER}\nA`]);
});
