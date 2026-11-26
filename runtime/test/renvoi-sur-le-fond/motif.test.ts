import assert from "node:assert/strict";
import { test } from "node:test";
import { ligneDuMotif } from "../../src/renvoi-sur-le-fond/motif.ts";

test("each kind of send-back states exactly one reason line from the closed list (#4302)", () => {
  assert.equal(ligneDuMotif("conflict", "conflicts with main"), "Send-back reason: unmet criterion");
  assert.equal(ligneDuMotif("red CI", "runtime tests"), "Send-back reason: failing test");
  assert.equal(ligneDuMotif("review", "- **Blocking**: Criterion of the ticket not met\n- **Blocking**: it crashes"), "Send-back reason: wrong behaviour, unmet criterion");
});
