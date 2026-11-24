// Criterion 4 (#4037): the log persists in the directory passed as an argument, like the level store.
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

describe("gesture log persistence", () => {
  test("a gesture written in a directory is read back from it, in order, with its counters", () => {
    consignerGeste(dossier, "closer", { line: "a", reason: "r", outcome: OUTCOME.FIXED_BY_SELF }, () => A(3));
    consignerGeste(dossier, "closer", { line: "b", reason: "r", outcome: OUTCOME.HANDED_TO_CHEF }, () => A(4));
    assert.deepEqual(gestesDe(dossier, "closer").map((g) => g.line), ["a", "b"]);
    assert.deepEqual(compteursDe(dossier, "closer"), { fixedBySelf: 1, handedToChef: 1 });
    const autre = mkdtempSync(join(tmpdir(), "gestes-autre-"));
    try {
      assert.deepEqual(gestesDe(autre, "closer"), []);
    } finally {
      rmSync(autre, { recursive: true, force: true });
    }
  });
});
