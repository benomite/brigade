// #3982, critère 2 : le taux du premier coup et le temps perdu sont toujours calculés, des mêmes données.
import assert from "node:assert/strict";
import { test } from "node:test";
import { mesurerQualite, type QualiteDuTicket } from "../../src/mesure-qualite.ts";
import { tempsPerdu, ticketsRecents } from "../../src/temps-max/mesure.ts";
import type { TempsTicket } from "../../src/temps-ticket/ligne-status.ts";

const ticket = (n: number, perdu: TempsTicket["perdu"]): TempsTicket => ({ ticket: n, mergedAt: new Date(Date.UTC(2026, 10, 7) + n * 10 * 60_000).toISOString(), cuisson: 300, cuissonTests: 0, attentePasse: 0, revue: 0, ci: 0, merge: 0, perdu });

test("the first-try rate and the lost time are computed from the same data as before", () => {
  const temps = [ticket(1, { attente: 20 * 60, ratees: 0, renvois: 0 }), ticket(2, { attente: 0, ratees: 60, renvois: 30 }), ticket(3, { attente: 0, ratees: 0, renvois: 0 })];
  const qualites = new Map<number, QualiteDuTicket>([
    [1, { renvois: [], cooksRates: 0 }],
    [2, { renvois: ["criteria not met"], cooksRates: 1 }],
    [3, { renvois: [], cooksRates: 0 }],
  ]);
  const q = mesurerQualite(temps, qualites);
  assert.equal(q.mesures, 3);
  assert.equal(q.premierCoup, 2 / 3);
  assert.deepEqual(q.motifsDeRenvoi, [{ nom: "criteria not met", fois: 1 }]);
  assert.deepEqual(ticketsRecents(temps).map(tempsPerdu), [1200, 90, 0]);
});
