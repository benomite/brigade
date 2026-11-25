// #4219, criterion 1: a manager `decision` verdict sets the `decision` label and puts a TODO card with the question,
// one button per answer, the recommended answer first.
import assert from "node:assert/strict";
import { test } from "node:test";
import { cartesEnTodo } from "../../src/carte-todo.ts";
import { chef, cuisine, issue } from "../aides/cuisine.ts";
import { jusqua } from "../outils.ts";

test("the `decision` verdict sets the label and the card shows the question, one button per answer, the recommended first", async (t) => {
  const c = cuisine(t, { manager: { jugement: "juge-decision-reponses" }, issues: [issue(30, [])] });
  chef(c.repertoire, "manager.enabled");

  await jusqua(() => (c.gh.lire(30)?.labels ?? []).includes("decision"), 10_000);
  await jusqua(() => cartesEnTodo(c.journal.base).some((carte) => carte.ticket === 30), 10_000);

  const carte = cartesEnTodo(c.journal.base).find((x) => x.ticket === 30);
  assert.equal(carte?.question, "Do you grant the deploy role write access to the backup bucket?");
  assert.deepEqual(
    carte?.choix.map((choix) => choix.texte),
    ["Refuse: backups stay read-only", "Grant it, read-only elsewhere", "Close it: out of scope"],
  );
});
