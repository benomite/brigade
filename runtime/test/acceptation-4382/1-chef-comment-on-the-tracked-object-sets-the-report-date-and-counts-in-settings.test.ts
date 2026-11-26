// #4382 criterion 1: the chef comments on the tracked object 10 minutes after the red starts: the post-mortem's chef-report date is the comment's own date.
import assert from "node:assert/strict";
import { test } from "node:test";
import { vueDesPostMortems } from "../../../app/src/projects/post-mortems.ts";
import { lirePostMortems } from "../../src/post-mortems/post-mortems.ts";
import { A, CHEF, cuisine, rangees } from "./cuisine.ts";

test("the chef's comment on the tracked issue, 10 minutes after the red starts, is the report date: chef saw it first, and the 7-day count includes it", async (t) => {
  const c = cuisine(t);
  c.etat.checks = c.rouge(A("10:00"));
  // Main turned red at 10:00; the station's first tick reading it comes at 10:15; the chef commented in between.
  c.commenter("10:10", CHEF, "main is failing again, #4100 is on it?");
  await c.tic("10:15");
  await c.tic("10:25");
  await c.enveloppe.merger(4200, "deadbeef");
  c.etat.checks = c.verte;
  await c.tic("11:00");
  const lus = rangees(c.fichier) as Array<{ signaleeParLeChef: string | null }>;
  assert.equal(lus.length, 1);
  assert.equal(lus[0]?.signaleeParLeChef, A("10:10"), "the chef-report date is the comment's date, not a runtime tick");
  assert.equal(lirePostMortems(c.repertoire, "shop")[0]?.vuEnPremier, "chef");
  // The Settings section's count, computed by the app's own code from what `facts` publishes.
  assert.equal(vueDesPostMortems(c.publies(), new Date(A("11:00"))).vusParLeChef, 1);
});

test("a chef comment on the tracked issue whose title names the failing state is a report, even when its words do not", async (t) => {
  const c = cuisine(t);
  c.etat.checks = c.rouge(A("10:00"));
  c.commenter("10:12", CHEF, "On it.");
  await c.tic("10:20");
  c.etat.checks = c.verte;
  await c.tic("10:45");
  assert.equal((rangees(c.fichier)[0] as { signaleeParLeChef: string }).signaleeParLeChef, A("10:12"));
  assert.equal(lirePostMortems(c.repertoire, "shop")[0]?.vuEnPremier, "chef");
});

test("a chef comment after the system's first sight is still the report date, and the system saw it first", async (t) => {
  const c = cuisine(t);
  c.etat.checks = c.rouge(A("10:00"));
  await c.tic("10:05");
  c.commenter("10:10", CHEF, "CI is broken on main");
  c.etat.checks = c.verte;
  await c.tic("10:45");
  assert.equal((rangees(c.fichier)[0] as { signaleeParLeChef: string }).signaleeParLeChef, A("10:10"));
  assert.equal(lirePostMortems(c.repertoire, "shop")[0]?.vuEnPremier, "system");
});

test("the chef's comments are read once the red ends; a failed read is said and read again at the next wake", async (t) => {
  const c = cuisine(t);
  c.etat.checks = c.rouge(A("10:00"));
  c.commenter("10:03", CHEF, "main is red");
  await c.tic("10:05");
  const commentaires = c.etat.commentaires;
  c.etat.commentaires = new Proxy(commentaires, { get: () => { throw new Error("GitHub is down"); } });
  c.etat.checks = c.verte;
  await c.tic("10:45");
  assert.match(c.dits.join("\n"), /chef's report of an outage was not read/);
  assert.equal(lirePostMortems(c.repertoire, "shop").length, 0, "nothing is ranked with a report date decided in its place");
  c.etat.commentaires = commentaires;
  await c.tic("10:46");
  assert.equal(lirePostMortems(c.repertoire, "shop")[0]?.vuEnPremier, "chef");
});
