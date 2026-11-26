// #4280, critère 3 : pour un jour de fils, un seul digest est produit le lendemain matin ; sa première ligne est le nombre
// de pannes vues d'abord par le chef, et il n'a que quelques lignes.
import assert from "node:assert/strict";
import { test } from "node:test";
import { digestDeLaVeille } from "../../src/journal-du-jour/digest.ts";

const MATIN = new Date("2026-11-25T07:00:00.000Z");
const pm = (vuEnPremier: string, fin: string) => ({ cause: "c", duree: "45 min", vuEnPremier, corrige: "restart", ticket: "#1", fin });
const geste = (at: string, line: string, kind: string, outcome: string) => ({ at, line, reason: "r", outcome, kind });

test("a busy day gives one text of at most six lines, and a quiet day gives one line saying so", () => {
  const fils = {
    cook: Array.from({ length: 12 }, (_, i) => geste(`2026-11-24T${String(8 + i).padStart(2, "0")}:00:00.000Z`, `merged #${5000 + i}`, "delivered", "fixed by itself")),
    supervisor: [geste("2026-11-24T10:00:00.000Z", "main went red", "broke", "not done"), geste("2026-11-24T11:00:00.000Z", "zone cycle stuck", "unfixed", "handed to the chef")],
  };
  const chargee = digestDeLaVeille({ postMortems: [pm("chef", "2026-11-24T10:00:00.000Z"), pm("chef", "2026-11-24T12:00:00.000Z"), pm("chef", "2026-11-24T13:00:00.000Z")], fils }, MATIN);
  const lignes = chargee.split("\n").filter((l) => l.trim() !== "");
  assert.ok(lignes.length <= 6, "only a few lines, however many gestures");
  assert.match(lignes[0]!, /\b3\b/);
  assert.match(lignes[0]!, /chef/i);

  const calme = digestDeLaVeille({ postMortems: [], fils: { cook: [geste("2026-11-23T09:00:00.000Z", "the day before yesterday", "delivered", "fixed by itself")] } }, MATIN);
  assert.equal(calme.split("\n").filter((l) => l.trim() !== "").length, 1, "nothing to say: one line");
  assert.match(calme, /\b0\b/);
  assert.ok(!calme.includes("the day before yesterday"), "only yesterday is read");
});
