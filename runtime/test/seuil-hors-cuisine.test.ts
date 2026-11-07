// Le seuil du `hors-cuisine` : trois arrêts de suite, ou deux du même motif, jamais pour un désaccord.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { horsCuisine, type Arret } from "../src/seuil-hors-cuisine.ts";

const echec = (motif: string): Arret => ({ motif, desaccord: false });

describe("horsCuisine", () => {
  test("three identical failure reasons in a row give hors-cuisine", () => {
    assert.equal(horsCuisine([echec("ci red"), echec("ci red"), echec("ci red")]), true);
  });
  test("two identical reasons in a row give hors-cuisine at once", () => {
    assert.equal(horsCuisine([echec("ci red"), echec("ci red")]), true);
    assert.equal(horsCuisine([echec("timeout"), echec("ci  RED"), echec("ci red")]), true);
  });
  test("three different reasons in a row give hors-cuisine", () => {
    assert.equal(horsCuisine([echec("a"), echec("b"), echec("c")]), true);
  });
  test("two different reasons do not", () => {
    assert.equal(horsCuisine([echec("a"), echec("b")]), false);
  });
  test("three stops where any is a disagreement do not", () => {
    for (const i of [0, 1, 2]) {
      const arrets = [echec("a"), echec("b"), echec("c")];
      arrets[i] = { motif: "x", desaccord: true };
      assert.equal(horsCuisine(arrets), false);
    }
  });
  test("fewer than two stops never give hors-cuisine", () => {
    assert.equal(horsCuisine([]), false);
    assert.equal(horsCuisine([echec("a")]), false);
  });
});
