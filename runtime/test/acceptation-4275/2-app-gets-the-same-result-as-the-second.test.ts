// #4275, criterion 2: the app calls the same gesture and gets the same result as the second for the same input.
import assert from "node:assert/strict";
import { test } from "node:test";
import { fakeParked } from "./fake-parked.ts";
import { createParkedGesture } from "../../src/parked-gesture/parked-gesture.ts";

test("the app and the second, given the same input, get the same result and leave the same calls on the parked state", async () => {
  const outcomes: { caller: string; result: string; calls: string }[] = [];
  for (const caller of ["second", "app"]) {
    const parked = fakeParked();
    const gesture = createParkedGesture(parked);
    const parkResult = await gesture.park(12, { who: "Ana", for: "design review", until: "the design is approved" });
    const unparkResult = await gesture.unpark(12, "approved");
    outcomes.push({ caller, result: JSON.stringify([parkResult, unparkResult]), calls: JSON.stringify(parked.calls) });
  }
  assert.equal(outcomes[0]?.result, outcomes[1]?.result);
  assert.equal(outcomes[0]?.calls, outcomes[1]?.calls);
});
