// #4382 criterion 5: a normal product answer from the chef is not a report of the outage.
import assert from "node:assert/strict";
import { test } from "node:test";
import { lirePostMortems } from "../../src/post-mortems/post-mortems.ts";
import { A, CHEF, cuisine, rangees } from "./cuisine.ts";

test("the chef's product answer, which names no failing state, writes no report date", async (t) => {
  const c = cuisine(t);
  c.etat.checks = c.rouge(A("10:00"));
  c.commenter("10:10", CHEF, "Go with the blue variant for the onboarding card.", 4500);
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
