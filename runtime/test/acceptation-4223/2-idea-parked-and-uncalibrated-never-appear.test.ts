// #4223, critère 2 : une issue `idea`, une issue parquée et une issue pas encore calibrée n'apparaissent jamais dans le rail.
import assert from "node:assert/strict";
import { test } from "node:test";
import { topDuBacklog, type IssueDuBacklog } from "../../src/rail-backlog/rail-backlog.ts";

const issue = (number: number, labels: string[], createdAt: string, title = `Issue ${number}`): IssueDuBacklog => ({ number, title, labels, createdAt });
const PRETE = ["fire", "model:opus", "effort:medium"];

test("an idea, a parked issue and an uncalibrated issue never appear in the rail (#4223)", () => {
  const backlog = [
    issue(1, [...PRETE, "idea"], "2026-10-01T10:00:00Z"),
    issue(2, [...PRETE, "parked"], "2026-10-02T10:00:00Z"),
    issue(3, ["fire", "model:opus"], "2026-10-03T10:00:00Z"),
    issue(4, ["fire"], "2026-10-04T10:00:00Z"),
    issue(5, [...PRETE], "2026-11-01T10:00:00Z"),
  ];
  assert.deepEqual(topDuBacklog(backlog, 10).map((i) => i.number), [5]);
});
