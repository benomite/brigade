// Criterion 3 (#4037): `lastGesture` on the record follows the log.
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

import { enregistrementDe } from "../../../src/autonomie/agents/gestes.ts";

describe("lastGesture", () => {
  test("is empty with no gesture, then follows the most recent entry", () => {
    assert.equal(enregistrementDe(dossier, "supervisor").lastGesture, undefined);
    consignerGeste(dossier, "supervisor", { line: "one", reason: "r1", outcome: OUTCOME.FIXED_BY_SELF }, () => A(10));
    assert.equal(enregistrementDe(dossier, "supervisor").lastGesture?.line, "one");
    consignerGeste(dossier, "supervisor", { line: "two", reason: "r2", outcome: OUTCOME.HANDED_TO_CHEF }, () => A(11));
    const dernier = enregistrementDe(dossier, "supervisor").lastGesture;
    assert.equal(dernier?.line, "two");
    assert.equal(dernier?.at, A(11).toISOString());
    assert.equal(dernier?.outcome, OUTCOME.HANDED_TO_CHEF);
  });
});
