// #4219, criterion 3: the card stays through a `waiting` removal, a `fire` label and a new manager pass; it leaves only
// when the chef answers or the issue closes.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { issue } from "../aides/cuisine.ts";
import { jusqua } from "../outils.ts";
import { decision } from "./aide.ts";

async function avecLaCarte(t: TestContext) {
  const c = decision(t, { manager: { jugement: "juge-decision-reponses" }, issues: [issue(30, [])] });
  await jusqua(() => c.aLaCarte(30));
  return c;
}

test("`waiting` removed, then `fire` added, then a new manager pass: the card is still there after each step", async (t) => {
  const c = await avecLaCarte(t);

  // `waiting` (the old name of `parked`) set, then removed.
  c.changer(30, { labels: [...c.labels(30), "waiting"] }, "2026-10-08T11:00:00Z");
  await c.passeDuManager();
  c.changer(30, { labels: c.labels(30).filter((l) => l !== "waiting") }, "2026-10-08T11:01:00Z");
  await c.passeDuManager();
  assert.ok(await c.aLaCarte(30), "the card stays after `waiting` is removed");

  c.changer(30, { labels: [...c.labels(30), "fire"] }, "2026-10-08T11:02:00Z");
  await c.passeDuManager();
  assert.ok(await c.aLaCarte(30), "the card stays after `fire` is added");

  // A new manager pass on the changed issue: three polls of the open issues, the issue read again in each.
  const sondages = c.gh.sondages.ouvertes;
  c.gh.repondre(30, "A note from the chef, not an answer to the card.");
  c.changer(30, {}, "2026-10-08T11:03:00Z");
  await c.passeDuManager();
  assert.ok(c.gh.sondages.ouvertes >= sondages + 3, "the manager made a new pass over the open issues");
  assert.ok(await c.aLaCarte(30), "the card stays after a new manager pass");
  assert.deepEqual(c.gh.delabellisations, [], "nothing removed `chef-todo`");
});

test("the card leaves when the chef answers", async (t) => {
  const c = await avecLaCarte(t);

  const rendu = await c.repondre(30, "Refuse: backups stay read-only");
  assert.ok("repondue" in rendu, JSON.stringify(rendu));
  assert.equal(await c.aLaCarte(30), false);
});

test("the card leaves when the issue closes", async (t) => {
  const c = await avecLaCarte(t);

  c.changer(30, { state: "closed" }, "2026-10-08T12:00:00Z");
  await c.passeDuManager();
  assert.equal(await c.aLaCarte(30), false);
});
