// #4221, criterion 4: no issue is chosen when the kitchen has no room.
import assert from "node:assert/strict";
import { test } from "node:test";
import { choisirSuivante, prendreSuivante } from "../../src/prise-backlog/prise-backlog.ts";

test("no room, no choice", () => {
  const backlog = [{ number: 1, labels: ["prio:1"], createdAt: "2020-01-01T00:00:00Z" }];
  assert.equal(choisirSuivante({ backlog, freeRoom: 0 }), null);
});
