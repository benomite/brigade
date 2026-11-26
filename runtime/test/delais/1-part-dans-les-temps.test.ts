// #4308 criterion 1: the share of merged tickets within their expected time, as a percentage with the counts.
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

test("5 of 6 merged tickets within their expected time: `83 % (5/6)`", () => {
  const tickets = [1, 2, 3, 4, 5].map((n) => fusionne(n, { attendu: 30, dureeMin: 20 }));
  tickets.push(fusionne(6, { attendu: 30, dureeMin: 50 }));
  const delais = calculerLesDelais(tickets, MAINTENANT);
  assert.equal(delais.fusionnes, 6);
  assert.equal(delais.dans_les_temps, 5);
  assert.match(direLesDelais(delais).join("\n"), /83 % \(5\/6\)/);
});

test("a ticket merged more than 24 h ago is outside the window", () => {
  const delais = calculerLesDelais([fusionne(1, { attendu: 30, dureeMin: 20 }), fusionne(2, { attendu: 30, dureeMin: 20, fusionneIlYA: 25 * 60 })], MAINTENANT);
  assert.equal(delais.fusionnes, 1);
  assert.match(direLesDelais(delais).join("\n"), /100 % \(1\/1\)/);
});
