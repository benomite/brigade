// #4223, critère 5 : l'écran du rail montre les mêmes issues, dans le même ordre, que le haut des données du backlog.
import assert from "node:assert/strict";
import { test } from "node:test";
import { topDuBacklog, type IssueDuBacklog } from "../../../runtime/src/rail-backlog/rail-backlog.ts";
import { htmlDuRail } from "../../src/vue/rail/rail.ts";

const issue = (number: number, labels: string[], createdAt: string, title = `Issue ${number}`): IssueDuBacklog => ({ number, title, labels, createdAt });
const PRETE = ["fire", "model:opus", "effort:medium"];

test("the rail screen shows the same issues, in the same order, as the top of the backlog data (#4223)", () => {
  const backlog = [
    issue(1, [...PRETE], "2026-11-01T10:00:00Z", "Alpha"),
    issue(2, [...PRETE, "prio:1"], "2026-11-05T10:00:00Z", "Bravo"),
    issue(3, [...PRETE, "idea"], "2026-10-01T10:00:00Z", "Charlie"),
    issue(4, [...PRETE, "prio:1"], "2026-11-02T10:00:00Z", "Delta"),
    issue(5, ["fire"], "2026-10-01T10:00:00Z", "Echo"),
  ];
  const top = topDuBacklog(backlog, 3);
  assert.deepEqual(top.map((i) => i.number), [4, 2, 1]);
  const html = htmlDuRail(top);
  const vus = [...html.matchAll(/Alpha|Bravo|Charlie|Delta|Echo/g)].map((m) => m[0]);
  assert.deepEqual(vus, ["Delta", "Bravo", "Alpha"]);
});
