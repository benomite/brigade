// Le rail qui n'a rien rendu cesse d'attendre au bout d'une minute (#2055).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ATTENTE_MAX_MS, attenteEpuisee, RAIL_NON_LU } from "../../src/vue/attente-du-rail.js";

describe("attenteEpuisee", () => {
  test("the wait is not over before a minute, then it is", () => {
    const depuis = new Map<string, number>();
    assert.equal(attenteEpuisee(depuis, "p", 1_000), false);
    assert.equal(attenteEpuisee(depuis, "p", 1_000 + ATTENTE_MAX_MS - 1), false);
    assert.equal(attenteEpuisee(depuis, "p", 1_000 + ATTENTE_MAX_MS), true);
  });
  test("each project has its own clock", () => {
    const depuis = new Map<string, number>();
    attenteEpuisee(depuis, "a", 0);
    assert.equal(attenteEpuisee(depuis, "b", ATTENTE_MAX_MS), false);
  });
  test("the message is one line", () => {
    assert.ok(!RAIL_NON_LU.includes("\n"));
  });
});
