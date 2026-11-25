// #4221, criterion 3: a parked issue is never chosen.
import assert from "node:assert/strict";
import { test } from "node:test";
import { choisirSuivante, prendreSuivante } from "../../src/prise-backlog/prise-backlog.ts";

test("a parked issue is never chosen", () => {
  const backlog = [
    { number: 1, labels: ["parked", "prio:1"], createdAt: "2020-01-01T00:00:00Z" },
    { number: 2, labels: ["prio:4"], createdAt: "2026-06-01T00:00:00Z" },
  ];
  assert.equal(choisirSuivante({ backlog, freeRoom: 1 })?.number, 2);
  assert.equal(choisirSuivante({ backlog: [backlog[0]!], freeRoom: 1 }), null);
});
