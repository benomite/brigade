// #4219, criterion 7: the tick check runs for every project, not for one only: with two projects both are repaired.
import assert from "node:assert/strict";
import { test } from "node:test";
import { cartesEnTodo, sortirDeTodo } from "../../src/carte-todo.ts";
import { chef, cuisine, issue } from "../aides/cuisine.ts";
import { jusqua } from "../outils.ts";

test("two projects, each with a `fire` issue with no calibration and no card: both get their card back", async (t) => {
  const projets = ["alpha", "beta"].map((projet) => {
    const c = cuisine(t, { projet, manager: { jugement: "juge-decision-reponses" }, issues: [issue(30, [])] });
    chef(c.repertoire, "manager.enabled");
    return { projet, c, laCarte: () => cartesEnTodo(c.journal.base).some((carte) => carte.ticket === 30) };
  });
  for (const { c, laCarte } of projets) await jusqua(laCarte, 10_000);

  for (const { projet, c, laCarte } of projets) {
    chef(c.repertoire, "manager.disabled");
    assert.equal(sortirDeTodo(c.journal, projet, 30, "lost", "test"), true);
    c.gh.poser(issue(30, ["fire"], { updatedAt: "2026-10-08T12:00:00Z" }));
    assert.equal(laCarte(), false);
  }
  for (const { projet, laCarte } of projets) await jusqua(laCarte, 10_000).catch(() => assert.fail(`the project ${projet} was not repaired`));
});
