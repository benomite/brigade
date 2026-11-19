// La garde (#3852) : le marqueur `// brigade:guard` marque le cas déclaré juste
// après lui, la pass le dit dans sa ligne et son journal, et chaque consigne qui
// parle du rejeu — le renvoi, le tests cook, le cook — dit comment marquer.
import assert from "node:assert/strict";
import { test } from "node:test";
import { CONSIGNE_DE_RELECTURE } from "../../src/claude.ts";
import { journalDeLaPreuve, ligneDeLaPreuve, motifDuRenvoi, testsAjoutes, vertsSurLaBase, type Preuve } from "../../src/pass/rouge-sur-main.ts";
import { consigneDesTests } from "../../src/tests-acceptation/ecriture.ts";

test("the marker marks only the case declared right after it, in a new file as in a file that existed", () => {
  const base: Record<string, string> = { "t/vieux.test.ts": 'test("old", f);' };
  const branche: Record<string, string> = {
    "t/vieux.test.ts": 'test("old", f);\n// brigade:guard\ntest("kept", f);\ntest("new", f);',
    "t/neuf.test.ts": 'test("a", f);\n/* brigade:guard */\nit("b", f);',
    "t/construit.test.ts": "// brigade:guard\nfor (const x of xs) test(`${x}`, f);",
  };
  const ajoutes = testsAjoutes(Object.keys(branche), { base: (f) => base[f] ?? null, branche: (f) => branche[f] ?? null });
  assert.deepEqual(ajoutes.fichiers, [
    { fichier: "t/vieux.test.ts", neuf: false, unites: [{ fichier: "t/vieux.test.ts", nom: "kept", garde: true }, { fichier: "t/vieux.test.ts", nom: "new" }] },
    { fichier: "t/neuf.test.ts", neuf: true, unites: [{ fichier: "t/neuf.test.ts", nom: "a" }, { fichier: "t/neuf.test.ts", nom: "b", garde: true }] },
    { fichier: "t/construit.test.ts", neuf: true, unites: [{ fichier: "t/construit.test.ts", nom: null, garde: true }] },
  ]);
});

test("a guard green on main is accepted and said in the pass's line and log; an unmarked one is still sent back", () => {
  const preuve: Preuve = { rejeux: [{ fichier: "a.test.ts", nom: "kept", garde: true, main: true, branche: true }, { fichier: "a.test.ts", nom: "green", main: true, branche: true }] };
  assert.deepEqual(vertsSurLaBase(preuve).map(({ nom }) => nom), ["green"]);
  assert.equal(ligneDeLaPreuve(preuve, "main"), "Red on main, green on the branch: 2 added tests replayed alone on `main` — 0 red on `main` and green on the branch, 1 already green on `main`, 1 marked as guarding a behavior `main` already has (accepted green on `main`).");
  assert.match(journalDeLaPreuve(preuve, "main") ?? "", /`kept` \(`a\.test\.ts`\) green on `main`, green on the branch \(marked as a guard\); `green`/);
});

test("the send-back, the tests cook and the cook are each told how to mark a guard", () => {
  const [motif] = motifDuRenvoi([{ fichier: "a.test.ts", nom: "green", main: true, branche: true }], "main");
  assert.match(motif ?? "", /"as before" \/ "unchanged", mark the test as a guard instead: a `\/\/ brigade:guard` comment/);
  assert.match(consigneDesTests({ depot: "o/r", ticket: 1, titre: "t", corps: "b", criteres: ["c"] }), /« as before », « unchanged »[^.]*`\/\/ brigade:guard`/);
  assert.match(CONSIGNE_DE_RELECTURE, /« as before » \/ « unchanged »[^.]*`\/\/ brigade:guard`/);
});
