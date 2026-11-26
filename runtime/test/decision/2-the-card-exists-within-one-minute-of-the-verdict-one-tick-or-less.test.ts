// #4219, criterion 2: the card exists within one minute of the verdict (one tick or less).
import assert from "node:assert/strict";
import { test } from "node:test";
import { issue } from "../aides/cuisine.ts";
import { jusqua } from "../outils.ts";
import { decision } from "./aide.ts";

test("the delay between the verdict and the card is at most one minute", async (t) => {
  const c = decision(t, { manager: { jugement: "juge-decision-reponses" }, issues: [issue(30, [])] });

  // On the wall clock: the moment the verdict is in the journal, and the moment the card is read on GitHub.
  let verdictVu: number | null = null;
  await jusqua(async () => {
    if (verdictVu === null && c.journal.duTicket(30).some((e) => e.type === "manager.judged")) verdictVu = Date.now();
    return verdictVu !== null && (await c.aLaCarte(30));
  });
  const delai = Date.now() - (verdictVu ?? Number.NaN);
  assert.ok(delai >= 0 && delai <= 60_000, `the card came ${delai} ms after the verdict`);
  // One tick or less: the card is posed in the same pass as the verdict, before the manager polls the issues again.
  const sondages = c.gh.sondages.ouvertes;
  assert.ok(await c.aLaCarte(30));
  assert.ok(c.gh.sondages.ouvertes - sondages <= 1);
});
