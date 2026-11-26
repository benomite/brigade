// #4219, criterion 2: the card exists within one minute of the verdict (one tick or less).
import assert from "node:assert/strict";
import { test } from "node:test";
import { issue } from "../aides/cuisine.ts";
import { jusqua } from "../outils.ts";
import { decision } from "./aide.ts";

test("the delay between the verdict and the card is at most one minute", async (t) => {
  const c = decision(t, { manager: { jugement: "juge-decision-reponses" }, issues: [issue(30, [])] });

  // The runtime runs on a hand-moved clock: the delay is counted in the manager's polls of the open issues, one per tick,
  // and on the wall clock. Both are read as soon as the verdict is in the journal, then as soon as the card is on GitHub.
  let verdict: { sondages: number; ms: number } | null = null;
  await jusqua(async () => {
    if (verdict === null && c.journal.duTicket(30).some((e) => e.type === "manager.judged")) verdict = { sondages: c.gh.sondages.ouvertes, ms: Date.now() };
    return verdict !== null && (await c.aLaCarte(30));
  });
  const vu = verdict as { sondages: number; ms: number } | null;
  assert.ok(vu !== null);
  // One tick or less: no new poll of the open issues between the verdict and the card — it is posed in the verdict's pass.
  assert.equal(c.gh.sondages.ouvertes - vu.sondages, 0, "the card waited for a later tick of the manager");
  const delai = Date.now() - vu.ms;
  assert.ok(delai <= 60_000, `the card came ${delai} ms after the verdict`);
});
