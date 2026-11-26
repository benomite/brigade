// #4275, criterion 3: a park request without who, for what or until is rejected with a clear message; the ticket stays unchanged.
import assert from "node:assert/strict";
import { test } from "node:test";
import { fakeParked } from "./fake-parked.ts";
import { createParkedGesture } from "../../src/parked-gesture/parked-gesture.ts";

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

for (const blank of ["", "   "]) {
  test(`a park request with a blank '${JSON.stringify(blank)}' who is rejected and the ticket is unchanged`, async () => {
    const parked = fakeParked();
    const gesture = createParkedGesture(parked);
    await assert.rejects(async () => gesture.park(5, { ...COMPLETE, who: blank }), /who/);
    assert.deepEqual(parked.calls, []);
  });
}
