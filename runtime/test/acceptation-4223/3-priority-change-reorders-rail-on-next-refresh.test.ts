// #4223, critère 3 : quand le chef change la priorité d'une issue, l'ordre du rail change au prochain rafraîchissement.
// Interface visée : `railDuBacklog(lire, n)` rend `{ rafraichir() }` ; `lire` rend le backlog tel que GitHub le porte à cet instant.
import assert from "node:assert/strict";
import { test } from "node:test";
import { railDuBacklog, type IssueDuBacklog } from "../../src/rail-backlog/rail-backlog.ts";

const issue = (number: number, labels: string[], createdAt: string, title = `Issue ${number}`): IssueDuBacklog => ({ number, title, labels, createdAt });
const PRETE = ["fire", "model:opus", "effort:medium"];

test("changing an issue's priority reorders the rail on the next refresh (#4223)", () => {
  let backlog = [
    issue(1, [...PRETE, "prio:1"], "2026-11-01T10:00:00Z"),
    issue(2, [...PRETE, "prio:2"], "2026-11-02T10:00:00Z"),
    issue(3, [...PRETE, "prio:3"], "2026-11-03T10:00:00Z"),
  ];
  const rail = railDuBacklog(() => backlog, 3);
  assert.deepEqual(rail.rafraichir().map((i) => i.number), [1, 2, 3]);
  backlog = backlog.map((i) => (i.number === 3 ? { ...i, labels: [...PRETE, "prio:1"] } : i));
  assert.deepEqual(rail.rafraichir().map((i) => i.number), [1, 3, 2]);
});
