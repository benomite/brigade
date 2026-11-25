// #4219, criterion 5: an issue with `fire`, no calibration and no open card, for a project with a stored decision,
// gets its card back after one tick.
import assert from "node:assert/strict";
import { test } from "node:test";
import { cartesEnTodo, sortirDeTodo } from "../../src/carte-todo.ts";
import { chef, cuisine, issue } from "../aides/cuisine.ts";
import { jusqua } from "../outils.ts";

test("after one tick the card of the stored decision exists again", async (t) => {
  const c = cuisine(t, { manager: { jugement: "juge-decision-reponses" }, issues: [issue(30, [])] });
  chef(c.repertoire, "manager.enabled");
  const laCarte = () => cartesEnTodo(c.journal.base).some((carte) => carte.ticket === 30);
  await jusqua(laCarte, 10_000);

  // The state seen on espace #221: the manager is off, the card is gone, the issue has `fire` and no calibration.
  chef(c.repertoire, "manager.disabled");
  assert.equal(sortirDeTodo(c.journal, "brigade", 30, "lost", "test"), true);
  c.gh.poser(issue(30, ["fire"], { updatedAt: "2026-10-08T12:00:00Z" }));
  assert.equal(laCarte(), false);

  const ticks = () => c.journal.tout().filter((e) => e.type === "runtime.ticked").length;
  const avant = ticks();
  await jusqua(() => ticks() > avant, 10_000);
  await jusqua(laCarte, 10_000);

  const carte = cartesEnTodo(c.journal.base).find((x) => x.ticket === 30);
  assert.equal(carte?.question, "Do you grant the deploy role write access to the backup bucket?");
});
