// #3898 : sur un main rouge, le premier geste de la cuisine est la relance des
// jobs en échec, et rien d'autre. Pendant la relance, aucun ticket de
// réparation ne s'ouvre et la livraison qui attend un main vert ne se merge
// pas ; la relance finie, verte, rien ne s'ouvre et la livraison se merge ;
// rouge, la réparation s'ouvre comme avant, et elle seule se merge.
import assert from "node:assert/strict";
import { test } from "node:test";
import { FauxGitHub } from "../faux-github.ts";

async function tours(station: ReturnType<FauxGitHub["station"]>, n: number) {
  for (let i = 0; i < n; i += 1) {
    await station.tour();
    await station.calme();
  }
}

// Main rouge sur le run 601, jamais relancé ; une livraison sur le rail.
function mainRouge() {
  const faux = new FauxGitHub();
  const avertis: string[] = [];
  faux.runDeLaBase = 601;
  faux.base = "red";
  faux.feu(39);
  return { faux, avertis, a: faux.station("A", { avertir: (texte) => void avertis.push(texte) }) };
}

const relances = (faux: FauxGitHub) => faux.appels.filter((appel) => appel.quoi === "relancerLesEchecs").length;

test("main red and not yet re-run: the kitchen re-runs the failed jobs, opens no repair ticket, and merges nothing while the re-run runs", async () => {
  const { faux, avertis, a } = mainRouge();
  await tours(a, 4);
  assert.equal(relances(faux), 1);
  assert.equal(faux.relanceEnCours, true);
  assert.deepEqual(faux.creations, []);
  assert.equal(faux.mergee(39), undefined);
  assert.deepEqual(avertis, ["brigade : base red on A — the failed jobs of run 601 are re-run once before a repair ticket is opened; merges wait for the re-run"]);
});

test("the re-run turns green: no repair ticket is opened for that red, and the waiting delivery merges", async () => {
  const { faux, a } = mainRouge();
  await tours(a, 4);
  assert.equal(faux.mergee(39), undefined);
  faux.finirLaRelance("green");
  await tours(a, 4);
  assert.deepEqual(faux.creations, []);
  assert.equal(faux.mergee(39)?.mergeePar, "A");
  assert.equal(relances(faux), 1);
});

test("the re-run stays red: the repair ticket opens as before, it alone merges, and the delivery keeps waiting", async () => {
  const { faux, a } = mainRouge();
  await tours(a, 4);
  assert.deepEqual(faux.creations, []);
  faux.finirLaRelance("red");
  await tours(a, 6);
  assert.deepEqual(faux.creations, [900]);
  assert.ok(faux.ticket(900).labels.has("repair-main"));
  assert.ok(faux.ticket(900).corps.includes(`brigade:base-rouge sha=${faux.teteDeLaBase}`));
  assert.equal(faux.mergee(900)?.mergeePar, "A");
  assert.equal(faux.mergee(39), undefined);
  assert.equal(relances(faux), 1);
});
