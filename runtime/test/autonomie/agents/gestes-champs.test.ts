// Criterion 1 (#4037): each logged gesture has a time, one line, a reason and an outcome.
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

describe("an agent's gesture log", () => {
  test("each gesture has a time, one line, a reason and an outcome", () => {
    consignerGeste(dossier, "supervisor", { line: "reran `tests` on 0de1ff5", reason: "red for 10 min", outcome: OUTCOME.FIXED_BY_SELF }, () => A(17));
    const [geste] = gestesDe(dossier, "supervisor");
    assert.equal(geste.at, A(17).toISOString());
    assert.equal(geste.line, "reran `tests` on 0de1ff5");
    assert.doesNotMatch(geste.line, /\n/);
    assert.equal(geste.reason, "red for 10 min");
    assert.equal(geste.outcome, OUTCOME.FIXED_BY_SELF);
  });

  test("a gesture whose line spans several lines is refused or reduced to one line", () => {
    try {
      consignerGeste(dossier, "closer", { line: "first\nsecond", reason: "r", outcome: OUTCOME.FIXED_BY_SELF }, () => A(3));
    } catch {
      return;
    }
    assert.doesNotMatch(gestesDe(dossier, "closer")[0].line, /\n/);
  });
});
