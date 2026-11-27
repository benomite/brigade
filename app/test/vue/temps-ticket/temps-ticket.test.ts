// Les temps des tickets (#2346, épique #2336) : une durée en clair, et ce que l'app relit du suivi de la station.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { dureeEnClair } from "../../../src/vue/temps-ticket/temps-ticket.js";
import { lireSuivi } from "../../../src/projets/demande.ts";

const MIN = 60;

const ticket = (n: number, total: number, mergedAt = `2026-10-${String(10 + n).padStart(2, "0")}T10:00:00.000Z`, perdu?: { attente: number; ratees: number; renvois: number }) => ({
  ticket: n,
  claimedAt: "2026-10-01T00:00:00.000Z",
  mergedAt,
  cuisson: total * 0.4,
  cuissonTests: total * 0.1,
  attentePasse: total * 0.1,
  revue: total * 0.2,
  ci: total * 0.1,
  merge: total * 0.1,
  ...(perdu === undefined ? {} : { perdu }),
});
const date = (n: number) => `2026-10-${String(10 + n).padStart(2, "0")}T10:00:00.000Z`;

describe("une durée", () => {
  test("se dit en clair", () => {
    assert.equal(dureeEnClair(45), "45 s");
    assert.equal(dureeEnClair(12 * MIN), "12 min");
    assert.equal(dureeEnClair(65 * MIN), "1 h 5 min");
  });
});

describe("ce que l'app relit du suivi de la station", () => {
  const relu = (temps: unknown) => lireSuivi(JSON.stringify({ brigade: "projets-suivi", projets: [{ nom: "parade", etat: "servi", ...(temps === undefined ? {} : { temps }) }] }))[0]?.temps;

  test("les temps publiés arrivent tels quels, avec le seuil du temps perdu (2 min sans lui ou absurde)", () => {
    const lignes = [ticket(7, 20 * MIN)];
    assert.deepEqual(relu({ enregistrements: lignes, lostTimeMaxMin: 3 }), { enregistrements: lignes, lostTimeMaxMin: 3 });
    assert.equal(relu({ enregistrements: [], lostTimeMaxMin: -1 })?.lostTimeMaxMin, 2);
    assert.equal(relu({ enregistrements: [] })?.lostTimeMaxMin, 2);
  });

  test("le temps de la pass (#3512) arrive tel quel ; null, il n'est pas relayé", () => {
    const passe = { jours: 7, livraisons: 1, parts: [], phaseLaPlusLourde: null, partLaPlusLourde: { nom: "CI", partPct: 70 }, relancees: null, renvoyees: 0, passesRenvoyeesS: 0 };
    assert.deepEqual(relu({ enregistrements: [], lostTimeMaxMin: 2, passe }), { enregistrements: [], lostTimeMaxMin: 2, passe });
    assert.deepEqual(relu({ enregistrements: [], lostTimeMaxMin: 2, passe: null }), { enregistrements: [], lostTimeMaxMin: 2 });
  });

  test("absents ou illisibles : rien", () => {
    assert.equal(relu(undefined), undefined);
    assert.equal(relu({ enregistrements: "non" }), undefined);
  });
});
