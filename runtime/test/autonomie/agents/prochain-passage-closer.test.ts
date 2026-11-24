// The closer's next run (#4038): the text comes from a clock and a schedule
// handed in as arguments — no real timer, no process.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { prochainPassage } from "../../../src/autonomie/agents/prochain-passage.ts";

const HEURE = 3600 * 1000;
const MAINTENANT = new Date("2026-11-23T12:00:00.000Z");

describe("next run of the closer", () => {
  test("a schedule 3 h away reads « closer: next pass in 3 h »", () => {
    const at = new Date(MAINTENANT.getTime() + 3 * HEURE);
    const prochain = prochainPassage("closer", MAINTENANT, { at });
    assert.equal(prochain.text, "closer: next pass in 3 h");
    assert.equal(new Date(prochain.at).getTime(), at.getTime());
  });
});
