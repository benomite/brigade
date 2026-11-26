// #4219, criterion 4: the chef answers on the card with each of the four routes — on hold for the third party, split,
// back to the kitchen, closed —; one click in the app, and the issue ends in the state of that answer, with no other
// step and no copy-paste into the second's tab.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { issue } from "../aides/cuisine.ts";
import { jusqua } from "../outils.ts";
import { decision } from "./aide.ts";

async function avecLaCarte(t: TestContext, suite: string[]) {
  const c = decision(t, { manager: { suite: ["juge-decision-routes", ...suite] }, issues: [issue(30, [])] });
  await jusqua(() => c.aLaCarte(30));
  const carte = await c.carte(30);
  assert.deepEqual(
    carte?.choix.map(({ texte, suite: geste }) => [texte, geste]),
    [
      ["Wait for AF, the client", "wait"],
      ["Split it into tickets", "resume"],
      ["Ship it as one ticket", "resume"],
      ["Close it: out of scope", "close"],
    ],
  );
  return c;
}

test("the answer routed on hold leaves the issue parked for the third party", async (t) => {
  const c = await avecLaCarte(t, []);
  const rendu = await c.repondre(30, "Wait for AF, the client");
  assert.ok("repondue" in rendu, JSON.stringify(rendu));

  assert.equal(await c.aLaCarte(30), false);
  assert.deepEqual(c.labels(30), ["parked"]);
  assert.ok(c.gh.commentaires.some(([n, corps]) => n === 30 && corps.startsWith("<!-- brigade:parked ") && corps.includes("AF, the client")), "the hold names who it waits for");
});

test("the answer routed split makes the issue an epic that the manager splits", async (t) => {
  const c = await avecLaCarte(t, ["decoupe-tickets"]);
  const rendu = await c.repondre(30, "Split it into tickets");
  assert.ok("repondue" in rendu, JSON.stringify(rendu));

  await jusqua(() => c.dits(30).some((dit) => /epic split into/.test(dit)));
  assert.equal(await c.aLaCarte(30), false);
  assert.ok(c.labels(30).includes("epic"));
  assert.deepEqual(c.gh.creations, [501, 502, 503]);
});

test("the answer routed back to the kitchen gives the issue back to the manager, who puts it on the rail", async (t) => {
  const c = await avecLaCarte(t, ["juge-ticket"]);
  const rendu = await c.repondre(30, "Ship it as one ticket");
  assert.ok("repondue" in rendu, JSON.stringify(rendu));

  await jusqua(() => c.labels(30).includes("fire"));
  assert.equal(await c.aLaCarte(30), false);
  assert.ok(c.labels(30).some((l) => l.startsWith("model:")) && c.labels(30).some((l) => l.startsWith("effort:")), "calibrated");
  assert.equal(c.gh.lire(30)?.state, "open");
});

test("the answer routed closed closes the issue", async (t) => {
  const c = await avecLaCarte(t, []);
  const rendu = await c.repondre(30, "Close it: out of scope");
  assert.ok("repondue" in rendu, JSON.stringify(rendu));

  assert.equal(c.gh.lire(30)?.state, "closed");
  assert.equal(await c.aLaCarte(30), false);
});
