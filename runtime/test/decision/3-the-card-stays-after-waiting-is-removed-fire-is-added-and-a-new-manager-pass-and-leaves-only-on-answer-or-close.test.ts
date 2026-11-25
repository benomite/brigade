// #4219, criterion 3: the card stays through a `waiting` removal, a `fire` label and a new manager pass; it leaves only
// when the chef answers or the issue closes.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { cartesEnTodo } from "../../src/carte-todo.ts";
import { repondreALaCarte } from "../../src/reponse-carte.ts";
import { chef, cuisine, issue } from "../aides/cuisine.ts";
import { jusqua } from "../outils.ts";

async function jusquaLaCarte(t: TestContext) {
  const c = cuisine(t, { manager: { suite: ["juge-decision-reponses", "juge-decision-reponses"] }, issues: [issue(30, ["waiting"])] });
  chef(c.repertoire, "manager.enabled");
  await jusqua(() => cartesEnTodo(c.journal.base).some((carte) => carte.ticket === 30), 10_000);
  const laCarte = () => cartesEnTodo(c.journal.base).some((carte) => carte.ticket === 30);
  // Several ticks of the runtime go by before the card is read again.
  const laisserPasserDesTicks = async () => {
    const avant = c.journal.tout().filter((e) => e.type === "runtime.ticked").length;
    await jusqua(() => c.journal.tout().filter((e) => e.type === "runtime.ticked").length >= avant + 3, 10_000);
  };
  return { c, laCarte, laisserPasserDesTicks };
}

test("`waiting` removed, then `fire` added, then a new manager pass: the card is still there after each step", async (t) => {
  const { c, laCarte, laisserPasserDesTicks } = await jusquaLaCarte(t);

  c.gh.poser(issue(30, ["decision"], { updatedAt: "2026-10-08T11:00:00Z" }));
  await laisserPasserDesTicks();
  assert.ok(laCarte(), "the card stays after `waiting` is removed");

  c.gh.poser(issue(30, ["decision", "fire"], { updatedAt: "2026-10-08T11:01:00Z" }));
  await laisserPasserDesTicks();
  assert.ok(laCarte(), "the card stays after `fire` is added");

  const jugementsAvant = c.lancements().filter((l) => l.args.includes("--tools")).length;
  c.gh.poser(issue(30, ["decision", "fire"], { updatedAt: "2026-10-08T11:02:00Z" }));
  await jusqua(() => c.lancements().filter((l) => l.args.includes("--tools")).length > jugementsAvant, 10_000);
  await laisserPasserDesTicks();
  assert.ok(laCarte(), "the card stays after a new manager pass");
});

test("the card leaves when the chef answers", async (t) => {
  const { c, laCarte } = await jusquaLaCarte(t);

  const resultat = await repondreALaCarte(c.journal, c.gh.github, "brigade", 30, { choix: 1 });
  assert.equal(resultat.done, true);
  assert.equal(laCarte(), false);
});

test("the card leaves when the issue closes", async (t) => {
  const { c, laCarte, laisserPasserDesTicks } = await jusquaLaCarte(t);

  c.gh.poser(issue(30, ["decision"], { state: "closed", updatedAt: "2026-10-08T12:00:00Z" }));
  await jusqua(() => !laCarte(), 10_000);
  await laisserPasserDesTicks();
  assert.equal(laCarte(), false);
});
