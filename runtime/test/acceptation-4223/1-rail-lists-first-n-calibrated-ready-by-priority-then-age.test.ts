// #4223, critère 1 : avec un backlog de test, le rail liste les N premières issues calibrées et prêtes, dans l'ordre priorité puis âge.
// Interface visée : runtime/src/rail-backlog/rail-backlog.ts exporte `topDuBacklog(backlog, n)` et le type `IssueDuBacklog`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { topDuBacklog, type IssueDuBacklog } from "../../src/rail-backlog/rail-backlog.ts";

const issue = (number: number, labels: string[], createdAt: string, title = `Issue ${number}`): IssueDuBacklog => ({ number, title, labels, createdAt });
const PRETE = ["fire", "model:opus", "effort:medium"];

test("the rail lists the first N calibrated and ready issues, by priority then age (#4223)", () => {
  const backlog = [
    issue(1, [...PRETE], "2026-11-01T10:00:00Z"),
    issue(2, [...PRETE, "prio:1"], "2026-11-05T10:00:00Z"),
    issue(3, [...PRETE, "prio:1"], "2026-11-02T10:00:00Z"),
    issue(4, [...PRETE, "prio:2"], "2026-10-01T10:00:00Z"),
    issue(5, [...PRETE, "prio:3"], "2026-10-02T10:00:00Z"),
  ];
  assert.deepEqual(topDuBacklog(backlog, 4).map((i) => i.number), [3, 2, 4, 5]);
  assert.deepEqual(topDuBacklog(backlog, 2).map((i) => i.number), [3, 2]);
});
