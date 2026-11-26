// #4308 criterion 3: where the time went — cook, gates, review, send-backs, waits — adding up to the actual time within 1 minute.
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

test("the five parts of each listed overrun add up to its actual time, within 1 minute, and the output names them", () => {
  const tickets = [
    fusionne(1, { attendu: 20, dureeMin: 100, cookMin: 40, gatesMin: 12, revueMin: 15, renvoisMin: 18 }),
    fusionne(2, { attendu: 20, dureeMin: 61, cookMin: 30, gatesMin: 5, revueMin: 10, renvoisMin: 0 }),
  ];
  const delais = calculerLesDelais(tickets, MAINTENANT);
  assert.equal(delais.pires_depassements.length, 2);
  for (const p of delais.pires_depassements) {
    const { cook, gates, review, renvois, attentes } = p.repartition_min;
    for (const part of [cook, gates, review, renvois, attentes]) assert.ok(part >= 0);
    assert.ok(Math.abs(cook + gates + review + renvois + attentes - p.reel_min) <= 1, `#${p.ticket}: parts add up to ${p.reel_min}`);
  }
  const premier = delais.pires_depassements[0];
  assert.equal(premier?.reel_min, 100);
  assert.equal(premier?.repartition_min.gates, 12);
  assert.equal(premier?.repartition_min.review, 15);
  assert.equal(premier?.repartition_min.renvois, 18);
  const sortie = direLesDelais(delais).join("\n");
  for (const mot of [/cook/i, /gates/i, /review/i, /send-?backs/i, /waits?/i]) assert.match(sortie, mot);
});
