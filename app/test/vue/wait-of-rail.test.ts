// Le rail qui n'a rien rendu cesse d'attendre au bout d'une minute (#2055).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { WAIT_MAX_MS, waitExhausted, RAIL_NOT_READ } from "../../src/vue/wait-of-rail.js";

describe("attenteEpuisee", () => {
  test("the wait is not over before a minute, then it is", () => {
    const since = new Map<string, number>();
    assert.equal(waitExhausted(since, "p", 1_000), false);
    assert.equal(waitExhausted(since, "p", 1_000 + WAIT_MAX_MS - 1), false);
    assert.equal(waitExhausted(since, "p", 1_000 + WAIT_MAX_MS), true);
  });
  test("each project has its own clock", () => {
    const since = new Map<string, number>();
    waitExhausted(since, "a", 0);
    assert.equal(waitExhausted(since, "b", WAIT_MAX_MS), false);
  });
  test("the message is one line", () => {
    assert.ok(!RAIL_NOT_READ.includes("\n"));
  });
});
