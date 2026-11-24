// #4037: a gesture log that cannot be read is refused, never read empty nor overwritten; an unknown outcome is refused.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import { consignerGeste, enregistrementDe, gestesDe, GestesIllisibles, OUTCOME } from "../../../src/autonomie/agents/gestes.ts";

let dossier = "";
beforeEach(() => { dossier = mkdtempSync(join(tmpdir(), "gestes-")); });
afterEach(() => { rmSync(dossier, { recursive: true, force: true }); });
const A = (h: number) => new Date(`2026-11-23T${String(h).padStart(2, "0")}:00:00.000Z`);

describe("an unreadable gesture log", () => {
  for (const [cas, contenu] of [
    ["not JSON", "{"],
    ["not an object", "[]"],
    ["an agent's gestures not a list", `{"closer": {}}`],
    ["an entry without its reason", `{"closer": [{"at": "x", "line": "l", "outcome": "fixed by itself"}]}`],
    ["an entry with an unknown outcome", `{"closer": [{"at": "x", "line": "l", "reason": "r", "outcome": "green"}]}`],
  ] as const) {
    test(`${cas}: refused by the read and the write, and left as it is`, () => {
      const fichier = join(dossier, "autonomy-gestures.json");
      writeFileSync(fichier, contenu);
      assert.throws(() => gestesDe(dossier, "closer"), GestesIllisibles);
      assert.throws(() => enregistrementDe(dossier, "closer"), GestesIllisibles);
      assert.throws(() => consignerGeste(dossier, "closer", { line: "l", reason: "r", outcome: OUTCOME.FIXED_BY_SELF }, () => A(1)), GestesIllisibles);
      assert.equal(readFileSync(fichier, "utf8"), contenu);
    });
  }

  test("a gesture with an unknown outcome is refused and not logged", () => {
    assert.throws(() => consignerGeste(dossier, "closer", { line: "l", reason: "r", outcome: "green" as never }, () => A(1)), GestesIllisibles);
    assert.deepEqual(gestesDe(dossier, "closer"), []);
  });

  test("a line broken over several lines is logged on one line", () => {
    const geste = consignerGeste(dossier, "closer", { line: "deleted 412 lines\n  in retenue/", reason: "r", outcome: OUTCOME.FIXED_BY_SELF }, () => A(1));
    assert.equal(geste.line, "deleted 412 lines in retenue/");
    assert.equal(gestesDe(dossier, "closer")[0]?.line, "deleted 412 lines in retenue/");
  });

  test("the record carries the agent, its counters and its gestures", () => {
    consignerGeste(dossier, "closer", { line: "a", reason: "r", outcome: OUTCOME.HANDED_TO_CHEF }, () => A(1));
    const fiche = enregistrementDe(dossier, "closer");
    assert.equal(fiche.agent, "closer");
    assert.deepEqual(fiche.counters, { fixedBySelf: 0, handedToChef: 1 });
    assert.deepEqual(fiche.gestures.map(({ line }) => line), ["a"]);
    assert.equal("lastGesture" in enregistrementDe(dossier, "pass"), false);
  });
});
