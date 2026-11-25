// #4278, critère 3 : l'étape suivante ne démarre pas tant que la pass n'a pas accepté. Contrat : `avancerEtape(etat, { verdict: "green" | "red" | "pending" })` -> nouvel état `{ etapes, courante, essais, abandonne? }`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { avancerEtape, type EtatDeEtapes } from "../../src/etapes-du-ticket.ts";

test("the stage index moves forward only on a green verdict, never while pending or red", () => {
  const depart: EtatDeEtapes = { etapes: ["script", "storyboard", "voice"], courante: 1, essais: 0 };
  assert.equal(avancerEtape(depart, { verdict: "pending" }).courante, 1);
  assert.equal(avancerEtape(depart, { verdict: "red" }).courante, 1);
  assert.equal(avancerEtape(depart, { verdict: "green" }).courante, 2);
});
