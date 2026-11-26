// #4221, criterion 6: calibration runs after the choice and before the cook takes the issue, and it is stored on the issue.
import assert from "node:assert/strict";
import { test } from "node:test";
import { choisirSuivante, prendreSuivante } from "../../src/prise-backlog/prise-backlog.ts";

test("choice, then calibration stored on the issue, then the cook", async () => {
  const ordre: string[] = [];
  const stockees: Array<{ number: number; model: string; effort: string }> = [];
  const backlog = [{ number: 7, labels: ["prio:1"], createdAt: "2026-01-01T00:00:00Z" }];
  await prendreSuivante({
    backlog,
    freeRoom: 1,
    calibrate: async (issue: { number: number }) => {
      ordre.push(`calibrate:${issue.number}`);
      return { model: "opus", effort: "medium" };
    },
    addLabel: async () => {},
    storeCalibration: async (number: number, calibrage: { model: string; effort: string }) => {
      ordre.push("store");
      stockees.push({ number, ...calibrage });
    },
    startCook: async (issue: { number: number }) => void ordre.push(`cook:${issue.number}`),
  });
  assert.deepEqual(ordre, ["calibrate:7", "store", "cook:7"]);
  assert.deepEqual(stockees, [{ number: 7, model: "opus", effort: "medium" }]);
});
