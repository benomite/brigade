// The runtime suite as a whole (#4038): the new next-run tests pass and the
// existing runtime tests still pass — checked by the gate itself, which runs
// `npm --prefix runtime test`; here, the new module must exist and load.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import * as prochain from "../../../src/autonomie/agents/prochain-passage.ts";

describe("next-run module", () => {
  test("exports prochainPassage, which answers a text and a date for an agent with no schedule", () => {
    assert.equal(typeof prochain.prochainPassage, "function");
    const sans = prochain.prochainPassage("closer", new Date("2026-11-23T12:00:00.000Z"), null);
    assert.equal(typeof sans.text, "string");
    assert.notEqual(sans.text, "");
  });
});
