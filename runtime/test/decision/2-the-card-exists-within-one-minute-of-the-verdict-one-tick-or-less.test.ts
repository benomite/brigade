// #4219, criterion 2: the card exists within one minute of the verdict (one tick or less).
import assert from "node:assert/strict";
import { test } from "node:test";
import { cartesEnTodo } from "../../src/carte-todo.ts";
import { chef, cuisine, issue } from "../aides/cuisine.ts";
import { jusqua } from "../outils.ts";

test("the delay between the verdict and the card is at most one minute", async (t) => {
  const c = cuisine(t, { manager: { jugement: "juge-decision-reponses" }, issues: [issue(30, [])] });
  chef(c.repertoire, "manager.enabled");

  await jusqua(() => c.journal.duTicket(30).some((e) => e.type === "manager.judged"), 10_000);
  const verdictLe = c.journal.duTicket(30).find((e) => e.type === "manager.judged")?.at ?? "";
  const mesure = Date.now();
  await jusqua(() => cartesEnTodo(c.journal.base).some((carte) => carte.ticket === 30), 10_000);

  const carte = cartesEnTodo(c.journal.base).find((x) => x.ticket === 30);
  assert.ok(Date.now() - mesure <= 60_000);
  assert.ok(Date.parse(carte?.since ?? "") - Date.parse(verdictLe) <= 60_000);
});
