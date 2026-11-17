// Un critère testable a un test gelé (#3741) : les critères d'une fiche selon le
// contrat (classe `testable` / `not-testable` + preuve), contre des livraisons
// de fixture.
import assert from "node:assert/strict";
import { test } from "node:test";
import { lireLeCritere, motifsDesCriteres } from "../../src/pass/criteres-testables.ts";
import type { Preuve } from "../../src/pass/rouge-sur-main.ts";

const GELE = "test/a.test.ts";
const preuve: Preuve = { rejeux: [{ fichier: GELE, nom: "sends back", main: false, branche: true }] };
const SANS_PREUVE: Preuve = { rejeux: [] };
const motifs = (criteres: string[], couvertures: Array<{ tests: string[]; relecture: boolean }>, p: Preuve, gelés: string[]) => motifsDesCriteres(criteres.map(lireLeCritere), couvertures, p, gelés);

test("a testable criterion with no frozen test is sent back, named", () => {
  const m = motifs(["Given a delivery, the pass sends back (testable)"], [{ tests: [], relecture: false }], SANS_PREUVE, []);
  assert.equal(m.length, 1);
  assert.match(m[0]!, /criterion 1 \(“Given a delivery, the pass sends back”\).*no frozen test/);
});

test("a testable criterion covered by a test outside the frozen commit is sent back", () => {
  const m = motifs(["The pass sends back (testable)"], [{ tests: ["sends back"], relecture: false }], preuve, ["test/autre.test.ts"]);
  assert.equal(m.length, 1);
  assert.match(m[0]!, /not in the frozen acceptance commit/);
});

test("covered testable criteria and not-testable ones with their proof are not sent back", () => {
  const m = motifs(
    ["The pass sends back (testable)", "The footer says v2 (not-testable: proof by capture)"],
    [{ tests: ["sends back"], relecture: false }, { tests: [], relecture: true }],
    preuve,
    [GELE],
  );
  assert.deepEqual(m, []);
});

test("a not-testable criterion without its proof is sent back", () => {
  const m = motifs(["The footer says v2 (not-testable: proof by capture)"], [{ tests: [], relecture: false }], SANS_PREUVE, []);
  assert.match(m[0]!, /criterion 1.*proof it owes \(capture\) is not in the delivery/);
});

test("a behaviour criterion classed not-testable is sent back even with a proof", () => {
  const m = motifs(["Given a delivery without test, the pass sends it back (not testable: proof by diff)"], [{ tests: [], relecture: true }], SANS_PREUVE, []);
  assert.match(m[0]!, /describes a behaviour and is classed not-testable/);
});

test("a sheet with no testable criterion is not sent back for lacking tests", () => {
  const m = motifs(["No testable criterion: proof by capture of the screen"], [{ tests: [], relecture: false }], SANS_PREUVE, []);
  assert.deepEqual(m, []);
  assert.deepEqual(lireLeCritere("no testable criterion: proof by diff"), { texte: "no testable criterion: proof by diff", classe: "none", preuve: "diff" });
});
