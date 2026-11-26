// #4219, criterion 7: the tick check runs for every project, not for one only: with two projects both are repaired.
import assert from "node:assert/strict";
import { test } from "node:test";
import { chef, issue } from "../aides/cuisine.ts";
import { jusqua } from "../outils.ts";
import { decision, tickDeLaStation } from "./aide.ts";

test("two projects, each with a `fire` issue with no calibration and no card: both get their card back", async (t) => {
  const projets = ["alpha", "beta"].map((projet) => ({ projet, c: decision(t, { projet, manager: { jugement: "juge-decision-reponses" }, issues: [issue(30, [])] }) }));
  for (const { c } of projets) await jusqua(() => c.aLaCarte(30));
  for (const { c } of projets) {
    chef(c.repertoire, "manager.disabled");
    await c.gh.github.delabelliser(30, "chef-todo");
    await c.gh.github.labelliser(30, ["fire"]);
    assert.equal(await c.aLaCarte(30), false);
  }

  // Each project's station ticks; one tick each.
  for (const { c } of projets) await tickDeLaStation(c).tick();

  for (const { projet, c } of projets) assert.ok(await c.aLaCarte(30), `the project ${projet} was repaired`);
});
