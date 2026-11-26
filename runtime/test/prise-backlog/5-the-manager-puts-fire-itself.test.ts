// #4221, criterion 5: the chosen issue gets `fire` from the manager code path, with no action from the chef or the second.
import assert from "node:assert/strict";
import { test } from "node:test";
import { choisirSuivante, prendreSuivante } from "../../src/prise-backlog/prise-backlog.ts";

test("the manager puts fire on the chosen issue and on no other", async () => {
  const labelsPoses: Array<{ number: number; label: string }> = [];
  const backlog = [
    { number: 1, labels: ["prio:2"], createdAt: "2026-01-01T00:00:00Z" },
    { number: 2, labels: ["prio:1"], createdAt: "2026-02-01T00:00:00Z" },
  ];
  const prise = await prendreSuivante({
    backlog,
    freeRoom: 1,
    calibrate: async () => ({ model: "opus", effort: "medium" }),
    addLabel: async (number: number, label: string) => void labelsPoses.push({ number, label }),
    storeCalibration: async () => {},
    startCook: async () => {},
  });
  assert.equal(prise?.number, 2);
  assert.ok(labelsPoses.some((l) => l.number === 2 && l.label === "fire"));
  assert.ok(!labelsPoses.some((l) => l.number === 1));
});
