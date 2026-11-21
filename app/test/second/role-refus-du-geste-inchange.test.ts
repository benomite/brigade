// #3997 : un refus du geste lui-même (merge, push d'un test gelé, lecture d'un secret) reste dit, jamais contourné,
// et remis au chef comme avant.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { ROLE_DU_SECOND } from "../../src/second/lancement.ts";

const role = readFileSync(ROLE_DU_SECOND, "utf8");

describe("le rôle du second : refus du geste", () => {
  // brigade:guard
  test("un refus est dit, jamais contourné, et le geste du chef est donné", () => {
    assert.match(role, /A refusal is said, in one sentence/);
    assert.match(role, /Never a silent refusal/);
    assert.match(role, /You do not work around it/);
    assert.match(role, /the exact command to run themselves with `!`, or the approval to give/);
  });
});
