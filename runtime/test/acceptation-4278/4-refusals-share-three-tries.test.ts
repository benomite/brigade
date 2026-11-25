// #4278, critère 4 : un refus ajoute un au compte d'essais du ticket ; au troisième refus au total, tous étages confondus, le ticket s'arrête (`abandonne: true`). Un ticket à une étape s'arrête de la même façon.
import assert from "node:assert/strict";
import { test } from "node:test";
import { avancerEtape, type EtatDeEtapes } from "../../src/etapes-du-ticket.ts";

test("three refusals spread over different stages stop the ticket, one per stage is not enough to reset the count", () => {
  let e: EtatDeEtapes = { etapes: ["a", "b", "c"], courante: 0, essais: 0 };
  e = avancerEtape(e, { verdict: "red" });
  assert.equal(e.essais, 1);
  e = avancerEtape(e, { verdict: "green" });
  assert.equal(e.essais, 1);
  e = avancerEtape(e, { verdict: "red" });
  assert.equal(e.essais, 2);
  assert.ok(!e.abandonne);
  e = avancerEtape(avancerEtape(e, { verdict: "green" }), { verdict: "red" });
  assert.equal(e.essais, 3);
  assert.equal(e.abandonne, true);
});

test("a single-stage ticket stops after three refusals too", () => {
  let e: EtatDeEtapes = { etapes: ["main"], courante: 0, essais: 0 };
  for (let i = 0; i < 3; i++) e = avancerEtape(e, { verdict: "red" });
  assert.equal(e.essais, 3);
  assert.equal(e.abandonne, true);
});
