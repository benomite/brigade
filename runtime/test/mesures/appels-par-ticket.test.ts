import { test } from "node:test";
import assert from "node:assert/strict";
import type { Delivery } from "../../src/projections/measures.ts";
import { describeCallsPerTicket, measureCallsPerTicket } from "../../src/mesures/appels-par-ticket.ts";

const merged = (...tickets: number[]) => tickets.map((ticket) => ({ ticket }));

test("12 merged tickets: only the last 10 are used and the average is right", () => {
  const deliveries = merged(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12);
  const perTicket = Object.fromEntries(deliveries.map(({ ticket }) => [ticket, ticket * 10]));
  const result = measureCallsPerTicket(deliveries, perTicket);
  assert.deepEqual(result.tickets.map(({ ticket }) => ticket), [3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.equal(result.average, 75);
  assert.equal(result.max, 120);
  const lines = describeCallsPerTicket(result);
  assert.match(lines[0]!, /average 75, max 120/);
  assert.match(lines[1]!, /#3: 30.*#12: 120/);
});

test("a merged ticket missing from the ledger is unknown, not 0", () => {
  const result = measureCallsPerTicket(merged(1, 2, 3), { 1: 10, 3: 20 });
  assert.equal(result.tickets[1]!.calls, null);
  assert.equal(result.average, 15);
  const lines = describeCallsPerTicket(result);
  assert.match(lines[1]!, /#2: unknown/);
  assert.match(lines[0]!, /1 unknown/);
});

test("fewer than 10 merges: reports over the merges available and says how many", () => {
  const lines = describeCallsPerTicket(measureCallsPerTicket(merged(5, 6), { 5: 4, 6: 8 }));
  assert.match(lines[0]!, /over the 2 merges available/);
  assert.match(lines[0]!, /average 6, max 8/);
});

test("no merge, or none known", () => {
  assert.match(describeCallsPerTicket(measureCallsPerTicket([], {}))[0]!, /no merge/);
  assert.match(describeCallsPerTicket(measureCallsPerTicket(merged(1), {}))[0]!, /average unknown/);
});

test("the real delivery type feeds the measure, in merge order", () => {
  const delivery = (ticket: number | null): Delivery => ({ ticket, at: "", measures: {}, state: {}, gatesS: null, cooks: [] });
  const result = measureCallsPerTicket([delivery(5), delivery(null), delivery(7)], { 5: 3, 7: 9 });
  assert.deepEqual(result.tickets, [{ ticket: 5, calls: 3 }, { ticket: 7, calls: 9 }]);
});
