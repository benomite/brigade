// #4308 criterion 5: a merged ticket without the label `attendu:<minutes>` is counted apart, never in the share.
import assert from "node:assert/strict";
import { test } from "node:test";
import { calculerLesDelais } from "../../src/delais/delais.ts";

const MAINTENANT = new Date("2026-11-25T12:00:00.000Z");
const a = (minutes: number) => new Date(MAINTENANT.getTime() - minutes * 60_000).toISOString();

// A ticket merged `fusionneIl_y_a` minutes ago, taken `dureeMin` minutes before its merge.
function fusionne(ticket: number, o: { attendu?: number; dureeMin: number; fusionneIlYA?: number; cookMin?: number; gatesMin?: number; revueMin?: number; renvoisMin?: number }) {
  const fin = o.fusionneIlYA ?? 60;
  return {
    ticket,
    titre: `Ticket ${ticket}`,
    etiquettes: [...(o.attendu === undefined ? [] : [`attendu:${o.attendu}`]), "opus", "medium"],
    modele: "opus",
    effort: "medium",
    priseAt: a(fin + o.dureeMin),
    prOuverteAt: a(fin + o.dureeMin - (o.cookMin ?? Math.round(o.dureeMin / 2))),
    fusionneAt: a(fin),
    gatesMin: o.gatesMin ?? 0,
    revueMin: o.revueMin ?? 0,
    renvoisMin: o.renvoisMin ?? 0,
  };
}

test("unlabeled tickets go to `sans_temps_attendu`, not to the share, not to the overruns", () => {
  const delais = calculerLesDelais([fusionne(1, { attendu: 30, dureeMin: 10 }), fusionne(2, { dureeMin: 500 }), fusionne(3, { dureeMin: 5 })], MAINTENANT);
  assert.equal(delais.fusionnes, 3);
  assert.equal(delais.sans_temps_attendu, 2);
  assert.equal(delais.dans_les_temps, 1);
  assert.equal(delais.part_dans_les_temps, 1);
  assert.deepEqual(delais.pires_depassements, []);
});

test("only unlabeled tickets: the share is null", () => {
  const delais = calculerLesDelais([fusionne(1, { dureeMin: 10 })], MAINTENANT);
  assert.equal(delais.part_dans_les_temps, null);
  assert.equal(delais.sans_temps_attendu, 1);
  assert.equal(delais.dans_les_temps, 0);
});
