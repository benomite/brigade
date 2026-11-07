// The "repairs" line of `status`: repairs of main over merged PRs, on the window of the ticket times.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { QualiteDuTicket } from "../src/mesure-qualite.ts";
import { direLesReparations } from "../src/status-reparations.ts";

// `n` tickets merged a minute apart, all within one day: the whole window.
const merges = (n: number) => Array.from({ length: n }, (_, i) => ({ ticket: i + 1, mergedAt: new Date(Date.UTC(2026, 10, 6, 0, i)).toISOString() }));
const qualites = (n: number, reparations: number) =>
  new Map<number, QualiteDuTicket>(Array.from({ length: n }, (_, i) => [i + 1, { renvois: [], cooksRates: 0, ...(i < reparations ? { reparation: ["test (runtime)"] } : {}) }]));

test("74 merged PRs and 7 repairs: the line gives 7, 74 and their ratio", () => {
  assert.equal(direLesReparations(merges(74), qualites(74, 7)), "repairs     7 repairs of main / 74 merged PRs = 0.095 (recent tickets)");
});

test("a window with no repair: ratio 0", () => {
  assert.equal(direLesReparations(merges(12), qualites(12, 0)), "repairs     0 repairs of main / 12 merged PRs = 0 (recent tickets)");
});

test("a window with no merged PR: the line, with n/a for the ratio", () => {
  assert.equal(direLesReparations([], new Map()), "repairs     0 repairs of main / 0 merged PRs = n/a (recent tickets)");
});
