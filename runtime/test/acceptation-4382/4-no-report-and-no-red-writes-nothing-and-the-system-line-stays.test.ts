// #4382 criterion 4: with no report and no red nothing is written; the settings line and the count behave as before.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { vueOfPostMortems } from "../../../app/src/projects/post-mortems.ts";
import { lirePostMortems } from "../../src/post-mortems/post-mortems.ts";
import { A, cuisine } from "./cuisine.ts";

// brigade:guard
test("no red and no report writes nothing; a red with no report still reads 'system' and counts none for the chef", async (t) => {
  const c = cuisine(t);
  c.etat.checks = c.verte;
  await c.tic("10:00");
  await c.tic("10:40");
  assert.equal(existsSync(join(c.repertoire, "post-mortems")), false, "nothing is written");
  c.etat.checks = c.rouge(A("11:00"));
  await c.tic("11:00");
  c.etat.checks = c.verte;
  await c.tic("11:35");
  const lus = lirePostMortems(c.repertoire, "shop");
  assert.equal(lus.length, 1);
  assert.equal(lus[0]?.vuEnPremier, "system");
  assert.equal(lus[0]?.duree, "35 min");
  assert.equal(lus[0]?.corrige, "not recorded — no merge and no supervisor repair was seen while main was red", "no merge and no repair seen: the screen says that case");
  assert.equal(vueOfPostMortems(c.publies(), new Date(A("11:35"))).vusParLeChef, 0);
});
