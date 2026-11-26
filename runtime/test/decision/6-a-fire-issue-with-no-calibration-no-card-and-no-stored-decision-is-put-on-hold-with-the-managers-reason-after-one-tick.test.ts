// #4219, criterion 6: the same issue with no stored decision is put on hold after one tick, with a comment carrying the
// manager's stated reason.
import assert from "node:assert/strict";
import { test } from "node:test";
import { LIMBO_MARK } from "../../src/limbo/reparer.ts";
import { chef, issue } from "../aides/cuisine.ts";
import { jusqua } from "../outils.ts";
import { decision, tickDeLaStation } from "./aide.ts";

// The reason the fake judge states (faux-claude.sh, `juge-incomplet`).
const RAISON = "Nothing says how to check it is done.";

test("after one tick the issue is on hold and carries the manager's reason", async (t) => {
  const c = decision(t, { manager: { jugement: "juge-incomplet" }, issues: [issue(30, [])] });
  // The manager states its reason on the issue: a refusal, not a decision.
  await jusqua(() => c.dits(30).some((dit) => dit.includes(RAISON)));
  // Its card gone, `fire` set by hand, no calibration.
  chef(c.repertoire, "manager.disabled");
  if (c.labels(30).includes("chef-todo")) await c.gh.github.delabelliser(30, "chef-todo");
  await c.gh.github.labelliser(30, ["fire"]);
  assert.equal(await c.aLaCarte(30), false);
  const avant = c.gh.commentaires.length;

  const { tick } = tickDeLaStation(c);
  const bilan = await tick();

  assert.deepEqual(bilan.echecs, []);
  assert.ok(c.labels(30).includes("parked"), "on hold");
  assert.equal(await c.aLaCarte(30), false);
  const ecrits = c.gh.commentaires.slice(avant).filter(([n]) => n === 30).map(([, corps]) => corps);
  assert.equal(ecrits.length, 1, "one comment, written by the tick");
  assert.ok(ecrits[0]?.includes(LIMBO_MARK));
  assert.ok(ecrits[0]?.includes(`The manager's reason: ${RAISON}`), ecrits[0] ?? "");
});
