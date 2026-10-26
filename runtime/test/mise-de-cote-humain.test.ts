// Une carte mise de côté faute de station dit qu'il faut un humain (1752) : le mot, la capacité qui manque, le geste,
// et que le ticket repart quand une station la fournit. Les autres raisons gardent leur texte.
import assert from "node:assert/strict";
import test from "node:test";
import { direMiseDeCote } from "../src/mise-de-cote.ts";

test("no-station : il faut un humain, la capacité manquante, le geste, et le ticket repartira", () => {
  const dit = direMiseDeCote("no-station: chrome-connecté");
  assert.match(dit, /humain/);
  assert.match(dit, /aucune station ne fournit chrome-connecté/);
  assert.match(dit, /brancher une station/);
  assert.match(dit, /repart alors/);
  assert.doesNotMatch(dit, /jamais|définitivement/);
});

test("no-station avec plusieurs capacités : toutes sont nommées", () => {
  const dit = direMiseDeCote("no-station: code + navigateur-headless");
  assert.match(dit, /humain/);
  assert.match(dit, /code \+ navigateur-headless/);
});

test("les autres raisons gardent leur texte", () => {
  assert.equal(direMiseDeCote(null), "attend : mis de côté, sans motif");
  assert.equal(direMiseDeCote("quota"), "attend : quota du compte épuisé");
  assert.equal(direMiseDeCote("pass:still-red"), "attend : la pass le trouve encore rouge");
  assert.equal(direMiseDeCote("station-absent: m1"), "attend : station absente (m1)");
  assert.equal(direMiseDeCote("autre"), "attend : mis de côté (autre)");
});
