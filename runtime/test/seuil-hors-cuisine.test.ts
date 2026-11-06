// Le seuil du `hors-cuisine` : trois fois le même motif, jamais pour un désaccord.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { horsCuisine, type Arret } from "../src/seuil-hors-cuisine.ts";

const echec = (motif: string): Arret => ({ motif, desaccord: false });

describe("horsCuisine", () => {
  test("three identical failure reasons in a row give hors-cuisine", () => {
    assert.equal(horsCuisine([echec("ci red"), echec("ci red"), echec("ci red")]), true);
  });
  test("two identical reasons then a different one do not", () => {
    assert.equal(horsCuisine([echec("ci red"), echec("ci red"), echec("timeout")]), false);
  });
  test("three stops where any is a disagreement do not", () => {
    for (const i of [0, 1, 2]) {
      const arrets = [echec("same"), echec("same"), echec("same")];
      arrets[i] = { motif: "same", desaccord: true };
      assert.equal(horsCuisine(arrets), false);
    }
  });
  test("fewer than three stops never give hors-cuisine", () => {
    assert.equal(horsCuisine([]), false);
    assert.equal(horsCuisine([echec("a")]), false);
    assert.equal(horsCuisine([echec("a"), echec("a")]), false);
  });
});
