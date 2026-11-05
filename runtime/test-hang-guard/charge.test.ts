// The 2 s rule under load (#2463): a test that really exceeds 2 s of its own work is still over the limit,
// a fast test stretched by a saturated machine is not.
import assert from "node:assert/strict";
import test from "node:test";
import { LIMITE_MS } from "../test/garde-duree/regle.ts";
import { dureeSansCharge, FACTEUR_MAX, facteurDeCharge, Observateur } from "./charge.ts";

test("on an idle machine the factor is 1, so a test that really waits past 2 s stays over the limit", () => {
  const observateur = new Observateur(() => 0.1);
  observateur.echantillonne();
  assert.equal(observateur.facteur, 1);
  assert.ok(dureeSansCharge(2500, observateur.facteur) > LIMITE_MS);
  assert.ok(dureeSansCharge(60_000, observateur.facteur) > LIMITE_MS);
});

test("a fast test stretched by a simulated saturated machine falls back under the limit", () => {
  const observateur = new Observateur(() => 3); // three runnable tasks per core
  observateur.echantillonne();
  assert.equal(observateur.facteur, 3);
  assert.ok(dureeSansCharge(3000, observateur.facteur) <= LIMITE_MS); // 1 s of work, tripled
});

test("the load excuses at most FACTEUR_MAX: a test far past the limit is slow whatever the load", () => {
  assert.equal(facteurDeCharge(50), FACTEUR_MAX);
  assert.ok(dureeSansCharge(20_000, facteurDeCharge(50)) > LIMITE_MS);
});

test("the worst load seen counts, a missing or unreadable one gives no relief", () => {
  const lues = [0.5, 2.5, 0.2];
  const observateur = new Observateur(() => lues.shift() ?? 0);
  for (let i = 0; i < 3; i++) observateur.echantillonne();
  assert.equal(observateur.facteur, 2.5);
  for (const v of [NaN, Infinity, -1, 0]) assert.equal(facteurDeCharge(v), 1);
});

test("the real probe reads a finite factor within bounds", () => {
  const observateur = new Observateur();
  observateur.echantillonne();
  assert.ok(observateur.facteur >= 1 && observateur.facteur <= FACTEUR_MAX);
});
