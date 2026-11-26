// #4382 criterion 3: at its first tick after start, the runtime reads the check of main and opens the outage from the start date the check carries.
import assert from "node:assert/strict";
import { test } from "node:test";
import { lirePostMortems } from "../../src/post-mortems/post-mortems.ts";
import { A, cuisine, rangees } from "./cuisine.ts";

test("a restart during the red: the post-mortem starts at the check's start, spans the restart, and is earlier than the first tick after it", async (t) => {
  const avant = cuisine(t);
  avant.etat.checks = avant.rouge(A("09:00"));
  await avant.tic("09:10");
  const apres = cuisine(t, avant.repertoire);
  apres.etat.checks = apres.rouge(A("09:00"));
  await apres.tic("10:05");
  apres.etat.checks = apres.verte;
  await apres.tic("10:10");
  const [pm] = lirePostMortems(apres.repertoire, "shop");
  assert.ok(pm, "the post-mortem exists at the end");
  assert.equal(pm.duree, "70 min", "09:00 (the check's start) to 10:10, not 10:05 to 10:10");
  const lus = rangees(apres.fichier) as Array<{ id: string }>;
  assert.deepEqual(lus.map(({ id }) => id), [`main-red@${A("09:00")}`], "one outage, recorded from 09:00, earlier than the first tick after the restart (10:05)");
});

test("a fresh runtime whose first tick reads a red check opens the outage from the check's start, not from that tick", async (t) => {
  const c = cuisine(t);
  c.etat.checks = c.rouge(A("09:20"));
  await c.tic("10:05");
  c.etat.checks = c.verte;
  await c.tic("10:10");
  assert.equal(lirePostMortems(c.repertoire, "shop")[0]?.duree, "50 min");
});

test("across a restart, the open outage is kept in the state directory even when the check after it carries no start", async (t) => {
  const avant = cuisine(t);
  avant.etat.checks = avant.rouge(A("09:00"));
  await avant.tic("09:10");
  const apres = cuisine(t, avant.repertoire);
  apres.etat.checks = apres.rouge(null);
  await apres.tic("10:05");
  apres.etat.checks = apres.verte;
  await apres.tic("10:10");
  assert.equal(lirePostMortems(apres.repertoire, "shop")[0]?.duree, "70 min");
});
