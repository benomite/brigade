// #4382 criterion 2: at the moment the red ends, the post-mortem records what fixed it.
import assert from "node:assert/strict";
import { test } from "node:test";
import { lirePostMortems } from "../../src/post-mortems/post-mortems.ts";
import { A, cuisine } from "./cuisine.ts";

test("an outage ended by a merged delivery names that PR", async (t) => {
  const c = cuisine(t);
  c.etat.checks = c.rouge(A("10:00"));
  await c.tic("10:00");
  await c.tic("10:20");
  await c.enveloppe.merger(4200, "deadbeef");
  c.etat.checks = c.verte;
  await c.tic("10:45");
  const [pm] = lirePostMortems(c.repertoire, "shop");
  assert.ok(pm, "the post-mortem exists");
  assert.equal(pm.corrige, "PR #4200 merged (commit deadbee)");
});

test("a merge made before the outage began does not fix it", async (t) => {
  const c = cuisine(t);
  await c.enveloppe.merger(4199, "cafe123");
  c.etat.checks = c.rouge(A("10:02"));
  await c.tic("10:05");
  c.etat.checks = c.verte;
  await c.tic("10:45");
  assert.match(String(lirePostMortems(c.repertoire, "shop")[0]?.corrige), /^not recorded — no merge/);
});
