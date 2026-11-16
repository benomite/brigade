import assert from "node:assert/strict";
import { test } from "node:test";
import { aDesCriteresTestables, doitMuter, lignesDeLaFiche, lireLesClasses, ligneSansCritereTestable } from "../../src/qualification/classes.ts";

const mixtes = [
  { criterion: "Each rail line shows its card's age", class: "testable" },
  { criterion: "docs/runtime/rail.md describes the display", class: "not-testable", proof: "the diff" },
  { criterion: "The rail's age column is right-aligned", class: "not-testable", proof: "before/after capture in the sheet" },
];

test("a sheet with mixed criteria lists every criterion with its class, and its proof when not testable", () => {
  const lues = lireLesClasses(mixtes);
  assert.ok("classes" in lues);
  assert.equal(aDesCriteresTestables(lues.classes), true);
  assert.deepEqual(lignesDeLaFiche(lues.classes), [
    "- Each rail line shows its card's age — testable",
    "- docs/runtime/rail.md describes the display — not testable, proof: the diff",
    "- The rail's age column is right-aligned — not testable, proof: before/after capture in the sheet",
  ]);
});

test("a ticket whose criteria are all not testable skips the tests step, and its sheet says 'no testable criterion: proof by <kind>'", () => {
  const lues = lireLesClasses([
    { criterion: "The README names the new command", class: "not-testable", proof: "diff" },
    { criterion: "The manager's role text names the rule", class: "not-testable", proof: "evaluation case" },
    { criterion: "The guide is reworded", class: "not-testable", proof: "diff" },
  ]);
  assert.ok("classes" in lues);
  assert.equal(aDesCriteresTestables(lues.classes), false);
  assert.equal(ligneSansCritereTestable(lues.classes), "no testable criterion: proof by diff / evaluation case");
  assert.equal(lignesDeLaFiche(lues.classes).at(-1), "no testable criterion: proof by diff / evaluation case");
});

test("mutations run only against frozen tests", () => {
  assert.equal(doitMuter(0), false);
  assert.equal(doitMuter(2), true);
});

test("a not-testable criterion without a proof, or a criterion without a class, is unreadable, never a guessed class", () => {
  assert.deepEqual(lireLesClasses([{ criterion: "The doc is updated", class: "not-testable", proof: " " }]), { illisible: "criterion 1 is not testable and names no proof" });
  assert.deepEqual(lireLesClasses([mixtes[0], { criterion: "The doc is updated" }]), { illisible: "criterion 2 has no class 'testable' or 'not-testable'" });
  assert.deepEqual(lireLesClasses([]), { illisible: "the classes of the criteria are not a non-empty list" });
  assert.deepEqual(lireLesClasses("testable"), { illisible: "the classes of the criteria are not a non-empty list" });
});
