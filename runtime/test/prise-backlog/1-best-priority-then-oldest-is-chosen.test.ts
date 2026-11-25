// #4221, criterion 1: with room in the kitchen, the manager chooses the open issue with the best priority; between two
// issues of equal priority, the oldest.
import assert from "node:assert/strict";
import { test } from "node:test";
import { choisirSuivante, prendreSuivante } from "../../src/prise-backlog/prise-backlog.ts";

const backlog = [
  { number: 10, labels: ["prio:2"], createdAt: "2026-01-01T00:00:00Z" },
  { number: 11, labels: ["prio:1"], createdAt: "2026-03-01T00:00:00Z" },
  { number: 12, labels: ["prio:1"], createdAt: "2026-02-01T00:00:00Z" },
  { number: 13, labels: ["prio:3"], createdAt: "2025-12-01T00:00:00Z" },
];

test("the best priority wins, then the oldest among equals", () => {
  assert.equal(choisirSuivante({ backlog, freeRoom: 1 })?.number, 12);
  const sansLaMeilleure = backlog.filter((i) => i.number !== 12);
  assert.equal(choisirSuivante({ backlog: sansLaMeilleure, freeRoom: 1 })?.number, 11);
  const sansPrio1 = sansLaMeilleure.filter((i) => i.number !== 11);
  assert.equal(choisirSuivante({ backlog: sansPrio1, freeRoom: 2 })?.number, 10);
});
