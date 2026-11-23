// Criterion 2 (#4037): « fixed by itself » and « handed to the chef » each change on the matching outcome.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import { compteursDe, consignerGeste, gestesDe, OUTCOME } from "../../../src/autonomie/agents/gestes.ts";

let dossier = "";
beforeEach(() => { dossier = mkdtempSync(join(tmpdir(), "gestes-")); });
afterEach(() => { rmSync(dossier, { recursive: true, force: true }); });
const A = (h: number) => new Date(`2026-11-23T${String(h).padStart(2, "0")}:00:00.000Z`);

describe("an agent's counters", () => {
  test("fixedBySelf and handedToChef each change only on their own outcome", () => {
    const g = (outcome: string) => consignerGeste(dossier, "supervisor", { line: "l", reason: "r", outcome: outcome as never }, () => A(1));
    assert.deepEqual(compteursDe(dossier, "supervisor"), { fixedBySelf: 0, handedToChef: 0 });
    g(OUTCOME.FIXED_BY_SELF);
    assert.deepEqual(compteursDe(dossier, "supervisor"), { fixedBySelf: 1, handedToChef: 0 });
    g(OUTCOME.HANDED_TO_CHEF);
    g(OUTCOME.HANDED_TO_CHEF);
    assert.deepEqual(compteursDe(dossier, "supervisor"), { fixedBySelf: 1, handedToChef: 2 });
  });

  test("the counters of one agent do not move with another agent's gestures", () => {
    consignerGeste(dossier, "closer", { line: "l", reason: "r", outcome: OUTCOME.FIXED_BY_SELF }, () => A(2));
    assert.deepEqual(compteursDe(dossier, "manager"), { fixedBySelf: 0, handedToChef: 0 });
  });
});
