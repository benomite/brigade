// #4275, criterion 3: a park request without who, for what or until is rejected with a clear message; the ticket stays unchanged.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createParkedGesture } from "../../src/parked-gesture/parked-gesture.ts";

// Fake of the parked state (runtime/src/parked/): same signatures as the real one, keeps a record per ticket.
function fakeParked() {
  const calls: unknown[][] = [];
  const records = new Map<number, unknown>();
  return {
    calls,
    records,
    park: (ticket: number, who: string, forWhat: string, until: string) => {
      calls.push(["park", ticket, who, forWhat, until]);
      records.set(ticket, { ticket, who, for: forWhat, until, step: "cooking" });
      return records.get(ticket);
    },
    unpark: (ticket: number, reason: string) => {
      calls.push(["unpark", ticket, reason]);
      records.delete(ticket);
      return { ticket, reason };
    },
  };
}

const COMPLETE = { who: "the chef", for: "a decision", until: "2026-12-01" };

for (const missing of ["who", "for", "until"] as const) {
  test(`a park request without '${missing}' is rejected with a message naming it, and the ticket is unchanged`, async () => {
    const parked = fakeParked();
    const gesture = createParkedGesture(parked);
    const request: Record<string, string> = { ...COMPLETE };
    delete request[missing];
    await assert.rejects(
      async () => gesture.park(5, request as typeof COMPLETE),
      (erreur: Error) => erreur.message.includes(missing),
    );
    assert.deepEqual(parked.calls, []);
    assert.equal(parked.records.has(5), false);
  });
}
