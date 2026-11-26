// #4382 criterion 6: only messages written by the chef are read as a report.
import assert from "node:assert/strict";
import { test } from "node:test";
import { lirePostMortems } from "../../src/post-mortems/post-mortems.ts";
import { A, cuisine, rangees } from "./cuisine.ts";

test("an agent's comment on the tracked issue never sets a report date", async (t) => {
  const c = cuisine(t);
  c.etat.checks = c.rouge(A("10:00"));
  c.commenter("10:10", "brigade-bot", "main is failing again, the supervisor is on it.");
  await c.tic("10:15");
  await c.tic("10:25");
  await c.enveloppe.merger(4200, "deadbeef");
  c.etat.checks = c.verte;
  await c.tic("11:00");
  const lus = rangees(c.fichier) as Array<{ signaleeParLeChef: string | null }>;
  assert.equal(lus.length, 1);
  assert.equal(lus[0]?.signaleeParLeChef, null, "no report date is written");
  assert.equal(JSON.stringify(lus[0]).includes(A("10:10")), false);
  assert.equal(lirePostMortems(c.repertoire, "shop")[0]?.vuEnPremier, "system");
  assert.match(String(lirePostMortems(c.repertoire, "shop")[0]?.corrige), /#?4200\b/, "the outage is still recorded in full, with what fixed it");
});
