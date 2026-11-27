// Les temps des tickets (#2346, épique #2336) : une durée en clair, et ce que l'app relit du suivi de la station.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { durationInClear } from "../../../src/vue/time-ticket/time-ticket.js";
import { readTracking } from "../../../src/projects/request.ts";

const MIN = 60;

const ticket = (n: number, total: number, mergedAt = `2026-10-${String(10 + n).padStart(2, "0")}T10:00:00.000Z`, lost?: { attente: number; ratees: number; renvois: number }) => ({
  ticket: n,
  claimedAt: "2026-10-01T00:00:00.000Z",
  mergedAt,
  cuisson: total * 0.4,
  cuissonTests: total * 0.1,
  attentePasse: total * 0.1,
  revue: total * 0.2,
  ci: total * 0.1,
  merge: total * 0.1,
  ...(lost === undefined ? {} : { perdu: lost }),
});
const date = (n: number) => `2026-10-${String(10 + n).padStart(2, "0")}T10:00:00.000Z`;

describe("une durée", () => {
  test("se dit en clair", () => {
    assert.equal(durationInClear(45), "45 s");
    assert.equal(durationInClear(12 * MIN), "12 min");
    assert.equal(durationInClear(65 * MIN), "1 h 5 min");
  });
});

describe("ce que l'app relit du suivi de la station", () => {
  const reread = (time: unknown) => readTracking(JSON.stringify({ brigade: "projets-suivi", projets: [{ nom: "parade", etat: "servi", ...(time === undefined ? {} : { temps: time }) }] }))[0]?.temps;

  test("les temps publiés arrivent tels quels, avec le seuil du temps perdu (2 min sans lui ou absurde)", () => {
    const lines = [ticket(7, 20 * MIN)];
    assert.deepEqual(reread({ enregistrements: lines, lostTimeMaxMin: 3 }), { enregistrements: lines, lostTimeMaxMin: 3 });
    assert.equal(reread({ enregistrements: [], lostTimeMaxMin: -1 })?.lostTimeMaxMin, 2);
    assert.equal(reread({ enregistrements: [] })?.lostTimeMaxMin, 2);
  });

  test("le temps de la pass (#3512) arrive tel quel ; null, il n'est pas relayé", () => {
    const pass = { jours: 7, livraisons: 1, parts: [], phaseLaPlusLourde: null, partLaPlusLourde: { nom: "CI", partPct: 70 }, relancees: null, renvoyees: 0, passesRenvoyeesS: 0 };
    assert.deepEqual(reread({ enregistrements: [], lostTimeMaxMin: 2, passe: pass }), { enregistrements: [], lostTimeMaxMin: 2, passe: pass });
    assert.deepEqual(reread({ enregistrements: [], lostTimeMaxMin: 2, passe: null }), { enregistrements: [], lostTimeMaxMin: 2 });
  });

  test("absents ou illisibles : rien", () => {
    assert.equal(reread(undefined), undefined);
    assert.equal(reread({ enregistrements: "non" }), undefined);
  });
});
