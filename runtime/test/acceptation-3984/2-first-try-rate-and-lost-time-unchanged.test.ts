// #3984, critère 2 : le taux du premier coup et le temps perdu sont toujours calculés, des mêmes données.
import assert from "node:assert/strict";
import { test } from "node:test";
import { partDuPremierCoup } from "../../src/mesure-qualite.ts";
import { tempsPerdu, ticketsRecents } from "../../src/temps-max/mesure.ts";
import type { TempsTicket } from "../../src/temps-ticket/ligne-status.ts";

test("the first-try rate and the lost time are computed from the same data as before", () => {
  assert.equal(partDuPremierCoup([{ renvois: [], cooksRates: 0 }, { renvois: ["x"], cooksRates: 0 }, { renvois: [], cooksRates: 1 }, { renvois: [], cooksRates: 0 }]), 0.5);
  const t: TempsTicket = { ticket: 1, cuisson: 600, cuissonTests: 0, attentePasse: 0, revue: 0, ci: 0, merge: 0, attenteQualification: 120, perdu: { attente: 180, ratees: 30, renvois: 60 } };
  assert.equal(tempsPerdu(t), 270);
  assert.deepEqual(ticketsRecents([]), []);
});
