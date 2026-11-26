// Le rail qui n'a rien rendu cesse d'attendre au bout d'une minute (#2055).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { WAIT_MAX_MS, waitEpuisee, RAIL_NON_LU } from "../../src/vue/wait-du-rail.js";

describe("attenteEpuisee", () => {
  test("the wait is not over before a minute, then it is", () => {
    const depuis = new Map<string, number>();
    assert.equal(waitEpuisee(depuis, "p", 1_000), false);
    assert.equal(waitEpuisee(depuis, "p", 1_000 + WAIT_MAX_MS - 1), false);
    assert.equal(waitEpuisee(depuis, "p", 1_000 + WAIT_MAX_MS), true);
  });
  test("each project has its own clock", () => {
    const depuis = new Map<string, number>();
    waitEpuisee(depuis, "a", 0);
    assert.equal(waitEpuisee(depuis, "b", WAIT_MAX_MS), false);
  });
  test("the message is one line", () => {
    assert.ok(!RAIL_NON_LU.includes("\n"));
  });
});
