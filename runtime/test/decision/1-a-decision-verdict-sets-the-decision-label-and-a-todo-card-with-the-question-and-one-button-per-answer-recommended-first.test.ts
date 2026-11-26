// #4219, criterion 1: a manager `decision` verdict parks the issue for the chef — `chef-todo`, the label the glossary
// gives the old `decision` label (#4129) — and puts a TODO card with the question, one button per answer, the
// recommended answer first.
import assert from "node:assert/strict";
import { test } from "node:test";
import { issue } from "../aides/cuisine.ts";
import { jusqua } from "../outils.ts";
import { decision } from "./aide.ts";

test("the `decision` verdict sets the label and the card shows the question, one button per answer, the recommended first", async (t) => {
  const c = decision(t, { manager: { jugement: "juge-decision-reponses" }, issues: [issue(30, [])] });

  await jusqua(() => c.aLaCarte(30));

  assert.ok(c.labels(30).includes("chef-todo"), "the issue carries the decision label `chef-todo`");
  const carte = await c.carte(30);
  assert.equal(carte?.sorte, "product-question");
  assert.equal(carte?.question, "Do you grant the deploy role write access to the backup bucket?");
  // The verdict's answers are, in its order: grant, refuse (recommended), close.
  assert.deepEqual(
    carte?.choix.map(({ texte, suite }) => [texte, suite]),
    [
      ["Refuse: backups stay read-only", "resume"],
      ["Grant it, read-only elsewhere", "resume"],
      ["Close it: out of scope", "close"],
    ],
  );
});
