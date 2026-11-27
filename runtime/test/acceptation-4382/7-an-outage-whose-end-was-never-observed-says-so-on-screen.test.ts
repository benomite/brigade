// #4382 criterion 7: 'not recorded' only where no source exists, and the screen says which case it is.
import assert from "node:assert/strict";
import { test } from "node:test";
import { vueOfPostMortems } from "../../../app/src/projects/post-mortems.ts";
import { Fake } from "../../../app/test/helpers/false-vue.ts";
import { A, CHEF, cuisine } from "./cuisine.ts";

// The app's view module is plain JavaScript with no declaration file: its one export is typed here.
const VUE = "../../../app/src/vue/project/banner-health/PostMortems.js";
const { setBlockPostMortems } = (await import(VUE)) as { setBlockPostMortems: (doc: unknown, vue: unknown) => unknown };

// The Settings section of the project, as the app draws it from what `facts` publishes: one line per field.
function ecran(c: ReturnType<typeof cuisine>, maintenant: string): string[] {
  const doc = { createElement: (balise: string) => new Fake(balise) };
  const bloc = setBlockPostMortems(doc, vueOfPostMortems(c.publies(), new Date(maintenant))) as unknown as Fake;
  const lignes: string[] = [];
  const parcourir = (noeud: Fake) => (noeud.tagName.toLowerCase() === "div" ? lignes.push(noeud.textContent) : noeud.children.forEach(parcourir));
  parcourir(bloc);
  return lignes;
}

test("an outage whose end was never observed reads 'not recorded' for what fixed it, and says the end was not observed", async (t) => {
  const avant = cuisine(t);
  avant.etat.checks = avant.rouge(A("09:00"));
  await avant.tic("09:10");
  // The runtime stops during the red; when it starts again the base is already green: nobody saw the red end.
  const apres = cuisine(t, avant.repertoire);
  apres.etat.checks = apres.verte;
  await apres.tic("10:30");
  await apres.tic("10:40");
  const lignes = ecran(apres, A("10:40"));
  assert.deepEqual(lignes, [
    "Cause: main was red",
    "Duration: at most 90 min",
    "Seen first by: system",
    "Fixed by: not recorded — the end of the outage was not observed: the runtime was not running when main turned green",
    "Fix ticket: not recorded",
  ]);
});

test("an outage whose end was observed shows its sources on screen, and 'not recorded' only for the fix ticket nobody named", async (t) => {
  const c = cuisine(t);
  c.etat.checks = c.rouge(A("10:00"));
  c.commenter("10:03", CHEF, "main is failing again");
  await c.tic("10:05");
  await c.enveloppe.merger(4200, "deadbeef");
  c.etat.checks = c.verte;
  await c.tic("10:45");
  assert.deepEqual(ecran(c, A("10:45")), ["Cause: main was red", "Duration: 45 min", "Seen first by: chef", "Fixed by: PR #4200 merged (commit deadbee)", "Fix ticket: not recorded"]);
});

test("before the first read of main's checks after a restart, the open outage waits: it is not closed as unobserved", async (t) => {
  const avant = cuisine(t);
  avant.etat.checks = avant.rouge(A("09:00"));
  await avant.tic("09:10");
  const apres = cuisine(t, avant.repertoire);
  // A wake with no check read yet.
  await apres.enveloppe.fires();
  apres.etat.checks = apres.rouge(A("09:00"));
  await apres.tic("10:00");
  apres.etat.checks = apres.verte;
  await apres.tic("10:10");
  assert.deepEqual(ecran(apres, A("10:10")).slice(1, 2), ["Duration: 70 min"]);
});
