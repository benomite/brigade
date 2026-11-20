// #3908, critère 2 : la part du premier coup et le temps perdu restent calculés,
// à partir des mêmes données qu'avant.
import assert from "node:assert/strict";
import { test } from "node:test";
import { mesurerQualite, type QualiteDuTicket } from "../../src/mesure-qualite.ts";
import { tempsPerdu } from "../../src/temps-max/mesure.ts";
import type { TempsTicket } from "../../src/temps-ticket/ligne-status.ts";

const temps = (ticket: number, rang: number): TempsTicket => ({
  ticket,
  depuis: new Date(Date.UTC(2026, 10, 7, 9 + rang)).toISOString(),
  mergedAt: new Date(Date.UTC(2026, 10, 7, 10 + rang)).toISOString(),
  attentePrise: 20 * 60,
  cuisson: 5 * 60,
  cuissonTests: 0,
  attentePasse: 0,
  revue: 0,
  ci: 0,
  merge: 0,
  perdu: { attente: 20 * 60, ratees: 0, renvois: 0 },
});

// brigade:guard
test("la part du premier coup et le temps perdu se calculent toujours depuis les mêmes données", () => {
  const tickets = [101, 102, 103, 104];
  const qualites = new Map<number, QualiteDuTicket>([
    [101, { renvois: ["Review"], cooksRates: 0 }],
    [102, { renvois: [], cooksRates: 1 }],
    [103, { renvois: [], cooksRates: 0 }],
    [104, { renvois: [], cooksRates: 0 }],
  ]);
  const enregistrements = tickets.map(temps);
  const qualite = mesurerQualite(enregistrements, qualites);
  assert.equal(qualite.premierCoup, 0.5);
  assert.equal(qualite.mesures, 4);
  assert.equal(tempsPerdu(enregistrements[0]), 20 * 60);
});
