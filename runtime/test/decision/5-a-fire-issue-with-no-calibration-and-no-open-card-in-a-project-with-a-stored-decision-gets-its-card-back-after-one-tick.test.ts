// #4219, criterion 5: an issue with `fire`, no calibration and no open card, with a stored decision, gets its card back
// after one tick.
import assert from "node:assert/strict";
import { test } from "node:test";
import { chef, issue } from "../aides/cuisine.ts";
import { jusqua } from "../outils.ts";
import { decision, tickDeLaStation } from "./aide.ts";

test("after one tick the card of the stored decision exists again", async (t) => {
  const c = decision(t, { manager: { jugement: "juge-decision-reponses" }, issues: [issue(30, [])] });
  await jusqua(() => c.aLaCarte(30));

  // The state seen on espace #221: the card's label gone, `fire` set, no calibration.
  chef(c.repertoire, "manager.disabled");
  await c.gh.github.delabelliser(30, "chef-todo");
  await c.gh.github.labelliser(30, ["fire"]);
  assert.equal(await c.aLaCarte(30), false);

  const { tick, avertis } = tickDeLaStation(c);
  const bilan = await tick();

  assert.deepEqual([bilan.echecs, avertis], [[], []]);
  const carte = await c.carte(30);
  assert.equal(carte?.question, "Do you grant the deploy role write access to the backup bucket?");
  assert.deepEqual(carte?.choix.map(({ texte }) => texte), ["Refuse: backups stay read-only", "Grant it, read-only elsewhere", "Close it: out of scope"]);
});
