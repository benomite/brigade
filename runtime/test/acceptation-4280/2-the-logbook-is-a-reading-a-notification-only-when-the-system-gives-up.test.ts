import assert from "node:assert/strict";
import { test } from "node:test";
import { notificationsDuJournal } from "../../src/journal-du-jour/notifications.ts";

// #4025 : le journal est une lecture, pas une alerte : une notification n'est envoyée que quand le système abandonne et
// a besoin du chef (« handed to the chef »).
const geste = (line: string, kind: string, outcome: string) => ({ at: "2026-11-25T10:00:00.000Z", line, reason: "r", outcome, kind });

test("delivered, broke, fixed and mistake entries notify nobody; only the one handed to the chef does", () => {
  const entrees = [
    geste("merged #4001", "delivered", "fixed by itself"),
    geste("main went red", "broke", "not done"),
    geste("reran main", "fixed", "fixed by itself"),
    geste("released a ticket by mistake", "mistake", "fixed by itself"),
    geste("zone cycle stuck, gave up", "unfixed", "handed to the chef"),
  ];
  assert.deepEqual(notificationsDuJournal(entrees.slice(0, 4)), []);
  const envoyees = notificationsDuJournal(entrees);
  assert.equal(envoyees.length, 1);
  assert.ok(JSON.stringify(envoyees[0]).includes("zone cycle stuck, gave up"));
});
