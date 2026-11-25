// Le rail, haut du backlog (#4223) : ce que les tests d'acceptation ne disent pas — la priorité redite d'alimenter.ts, la
// calibration de calibrage.ts, ce qui tient une issue hors de la file, et une date de création illisible.
import assert from "node:assert/strict";
import { test } from "node:test";
import { priorite } from "../../src/alimenter.ts";
import { calibrage, complet } from "../../src/calibrage.ts";
import { prioriteDe, railDuBacklog, topDuBacklog, type IssueDuBacklog } from "../../src/rail-backlog/rail-backlog.ts";

const issue = (number: number, labels: string[], createdAt = "2026-11-01T10:00:00Z"): IssueDuBacklog => ({ number, title: `Issue ${number}`, labels, createdAt });
const PRETE = ["fire", "model:opus", "effort:medium"];

test("the priority of the rail is the one the runtime reads (alimenter.ts)", () => {
  for (const labels of [[], ["prio:3"], ["prio:0"], ["prio:9", "prio:2"], ["prio:10"], ["prio:x"], ["prio:"], ["bug", "prio:5"]]) {
    assert.equal(prioriteDe(labels), priorite(labels), JSON.stringify(labels));
  }
});

test("an issue is calibrated as calibrage.ts says: one valid model and one valid effort", () => {
  const cas = [["model:opus", "effort:low"], ["model:opus"], ["effort:max"], ["model:gpt", "effort:low"], ["model:opus", "model:haiku", "effort:low"], ["model:sonnet", "effort:huge"]];
  for (const labels of cas) {
    const vu = topDuBacklog([issue(1, ["fire", ...labels])]).length === 1;
    assert.equal(vu, complet(calibrage(labels)), JSON.stringify(labels));
  }
});

test("without `fire`, set aside by the manager, waiting on a third party or out of the kitchen, an issue is not on the rail", () => {
  const backlog = [
    issue(1, ["model:opus", "effort:medium"]),
    issue(2, [...PRETE, "decision"]),
    issue(3, [...PRETE, "blocked-on-human"]),
    issue(4, [...PRETE, "waiting"]),
    issue(5, [...PRETE, "out-of-kitchen"]),
    issue(6, [...PRETE, "set-aside:failures"]),
    issue(7, [...PRETE]),
  ];
  assert.deepEqual(topDuBacklog(backlog).map((i) => i.number), [7]);
});

test("an unreadable creation date goes after the dated issues of its priority; equal dates go by number", () => {
  const backlog = [issue(1, [...PRETE, "prio:2"], "not a date"), issue(3, [...PRETE, "prio:2"], "2026-11-02T10:00:00Z"), issue(2, [...PRETE, "prio:2"], "2026-11-02T10:00:00Z"), issue(4, [...PRETE, "prio:1"], "not a date")];
  assert.deepEqual(topDuBacklog(backlog).map((i) => i.number), [4, 2, 3, 1]);
});

test("the rail shows ten issues by default, and none for a size of zero", () => {
  const backlog = Array.from({ length: 12 }, (_, i) => issue(i + 1, [...PRETE]));
  assert.deepEqual(topDuBacklog(backlog).map((i) => i.number), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.deepEqual(railDuBacklog(() => backlog).rafraichir().length, 10);
  assert.deepEqual(topDuBacklog(backlog, 0), []);
});
