// The supervisor's next run (#4038): the text comes from a clock and a
// schedule handed in as arguments — no real timer, no process.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { prochainPassage } from "../../../src/autonomie/agents/prochain-passage.ts";

describe("next run of the supervisor", () => {
  test("a schedule that gives 18:40 reads « supervisor: wakes if nothing is merged by 18:40 »", () => {
    // Built from local fields, so the 18:40 holds in any time zone.
    const maintenant = new Date(2026, 10, 23, 15, 0);
    const at = new Date(2026, 10, 23, 18, 40);
    const prochain = prochainPassage("supervisor", maintenant, { at });
    assert.equal(prochain.text, "supervisor: wakes if nothing is merged by 18:40");
    assert.equal(new Date(prochain.at).getTime(), at.getTime());
  });
});
