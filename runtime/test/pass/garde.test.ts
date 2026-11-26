// La garde (#3852) : le marqueur `// brigade:guard` marque le cas déclaré juste
// après lui, la pass le dit dans sa ligne et son journal, une garde verte des
// deux côtés couvre son critère, et chaque consigne qui parle du rejeu — le
// renvoi, le tests cook, le cook — dit comment marquer.
import assert from "node:assert/strict";
import { test } from "node:test";
import { CONSIGNE_DE_RELECTURE } from "../../src/claude.ts";
import { journalDeLaPreuve, ligneDeLaPreuve, lignesDesCriteres, motifDuRenvoi, testsAjoutes, vertsSurLaBase, type Preuve } from "../../src/pass/rouge-sur-main.ts";

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

test("neither the body of the previous case nor the file's header marks a case: only the comment lines right above it", () => {
  const branche: Record<string, string> = {
    "t/corps.test.ts": 'test("a", () => {\n  log("brigade:guard");\n});\ntest("b", f);',
    "t/entete.test.ts": '// brigade:guard\nimport x from "x";\n\ntest("a", f);\n// a note\n// brigade:guard\ntest("b", f);',
  };
  const ajoutes = testsAjoutes(Object.keys(branche), { base: () => null, branche: (f) => branche[f] ?? null });
  assert.deepEqual(ajoutes.fichiers.map(({ unites }) => unites), [
    [{ fichier: "t/corps.test.ts", nom: "a" }, { fichier: "t/corps.test.ts", nom: "b" }],
    [{ fichier: "t/entete.test.ts", nom: "a" }, { fichier: "t/entete.test.ts", nom: "b", garde: true }],
  ]);
});

test("a marker on the case's own line, before it, marks that case only; a marker after it does not; a name marked once stays marked", () => {
  const branche: Record<string, string> = {
    "t/ligne.test.ts": 'test("a", f);\n/* brigade:guard */ test("b", f);\ntest("c", f); // brigade:guard\ntest("d", f);\n// brigade:guard\ntest("e", f);\ntest("e", g);',
  };
  const ajoutes = testsAjoutes(Object.keys(branche), { base: () => null, branche: (f) => branche[f] ?? null });
  assert.deepEqual(ajoutes.fichiers.map(({ unites }) => unites), [
    [{ fichier: "t/ligne.test.ts", nom: "a" }, { fichier: "t/ligne.test.ts", nom: "b", garde: true }, { fichier: "t/ligne.test.ts", nom: "c" }, { fichier: "t/ligne.test.ts", nom: "d" }, { fichier: "t/ligne.test.ts", nom: "e", garde: true }],
  ]);
});

test("a guard green on main is accepted and said in the pass's line and log; an unmarked one is still sent back", () => {
  const preuve: Preuve = { rejeux: [{ fichier: "a.test.ts", nom: "kept", garde: true, main: true, branche: true }, { fichier: "a.test.ts", nom: "green", main: true, branche: true }, { fichier: "a.test.ts", nom: "green too", main: true, branche: true }] };
  assert.deepEqual(vertsSurLaBase(preuve).map(({ nom }) => nom), ["green", "green too"]);
  assert.equal(ligneDeLaPreuve(preuve, "main"), "Red on main, green on the branch: 3 added tests replayed alone on `main` — 0 red on `main` and green on the branch, 2 already green on `main`, 1 marked as guarding a behavior `main` already has (accepted green on `main`).");
  assert.match(journalDeLaPreuve(preuve, "main") ?? "", /`kept` \(`a\.test\.ts`\) green on `main`, green on the branch \(marked as a guard\); `green`/);
});

// brigade:guard
test("a guard green on both sides covers its criterion, and the verdict says so", () => {
  const preuve: Preuve = { rejeux: [{ fichier: "t/garde.test.ts", nom: "kept", garde: true, main: true, branche: true }, { fichier: "t/garde.test.ts", nom: "broken", garde: true, main: true, branche: false }] };
  const couvertures = [{ tests: ["kept"], relecture: false }, { tests: ["broken"], relecture: false }];
  assert.deepEqual(lignesDesCriteres(["It works as before", "It still works"], [couvertures[0]!, couvertures[1]!], preuve, "main"), [
    "- It works as before — **covered by a test marked as a guard, green on `main` and on the branch: `kept` (`t/garde.test.ts`)**",
    "- It still works — **covered by nothing**",
  ]);
});

// brigade:guard
test("the send-back and the cook are each told how to mark a guard", () => {
  const [motif] = motifDuRenvoi([{ fichier: "a.test.ts", nom: "green", main: true, branche: true }], "main");
  assert.match(motif ?? "", /"as before" \/ "unchanged", mark the test as a guard instead: a `\/\/ brigade:guard` comment/);
  assert.match(motif ?? "", /a second time, do not try a third way: mark it, or set the ticket aside once with the reason in one line between <bloque> and <\/bloque>/);
  assert.match(CONSIGNE_DE_RELECTURE, /« as before » \/ « unchanged »[^.]*`\/\/ brigade:guard`/);
});
