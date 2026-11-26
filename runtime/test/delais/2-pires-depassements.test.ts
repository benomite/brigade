// #4308 criterion 2: the slowest overruns, worst first, with number, title, expected and actual time.
import assert from "node:assert/strict";
import { test } from "node:test";
import { calculerLesDelais } from "../../src/delais/delais.ts";
import { direLesDelais } from "../../src/delais/affichage.ts";

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

test("overruns are listed worst first, at most 5, each with #number, title, expected and actual minutes", () => {
  const tickets = [
    fusionne(1, { attendu: 10, dureeMin: 25 }), // +15
    fusionne(2, { attendu: 10, dureeMin: 90 }), // +80
    fusionne(3, { attendu: 10, dureeMin: 40 }), // +30
    fusionne(4, { attendu: 10, dureeMin: 11 }),
    fusionne(5, { attendu: 10, dureeMin: 12 }),
    fusionne(6, { attendu: 10, dureeMin: 13 }),
    fusionne(7, { attendu: 10, dureeMin: 5 }), // on time
  ];
  const delais = calculerLesDelais(tickets, MAINTENANT);
  assert.deepEqual(delais.pires_depassements.map((p) => p.ticket), [2, 3, 1, 6, 5]);
  assert.equal(delais.pires_depassements[0]?.attendu_min, 10);
  assert.equal(delais.pires_depassements[0]?.reel_min, 90);
  const lignes = direLesDelais(delais);
  const ligne2 = lignes.findIndex((l) => l.includes("#2"));
  const ligne3 = lignes.findIndex((l) => l.includes("#3"));
  assert.ok(ligne2 !== -1 && ligne3 > ligne2, "#2 before #3");
  assert.match(lignes[ligne2] ?? "", /Ticket 2/);
  assert.match(lignes[ligne2] ?? "", /10 min/);
  assert.match(lignes[ligne2] ?? "", /90 min/);
  assert.ok(!lignes.some((l) => l.includes("#7")), "an on-time ticket is no overrun");
});
