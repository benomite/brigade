// #4275, criterion 1: the second parks and unparks a ticket the same way on project A and on project B.
import assert from "node:assert/strict";
import { test } from "node:test";
import { fakeParked } from "./fake-parked.ts";
import { createParkedGesture } from "../../src/parked-gesture/parked-gesture.ts";

const REQUEST = { who: "the chef", for: "waiting for the vendor's answer", until: "2026-12-01" };

test("the second parks then unparks a ticket on project A and on project B with the same result", async () => {
  const results: string[] = [];
  for (const project of ["A", "B"]) {
    const parked = fakeParked();
    const gesture = createParkedGesture(parked);
    const parkResult = await gesture.park(7, REQUEST);
    const unparkResult = await gesture.unpark(7, "the vendor answered");
    assert.deepEqual(
      parked.calls,
      [
        ["park", 7, "the chef", "waiting for the vendor's answer", "2026-12-01"],
        ["unpark", 7, "the vendor answered"],
      ],
      `project ${project}`,
    );
    results.push(JSON.stringify([parkResult, unparkResult]));
  }
  assert.equal(results[0], results[1]);
});
