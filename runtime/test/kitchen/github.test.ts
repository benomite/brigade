import assert from "node:assert/strict";
import { test } from "node:test";
import { dependsOn } from "../../src/kitchen/github.ts";

test("a ticket waits for every ticket its body says it depends on, is blocked by, or comes after", () => {
  assert.deepEqual(dependsOn("Part of #4497. Blocked by #4481 and #4498: take it once both are merged."), [4481, 4498]);
  assert.deepEqual(dependsOn("Depends on #12\nSee #7 for context.\nAfter #3, #4."), [12, 3, 4]);
  assert.deepEqual(dependsOn("Epic: #5\nCloses #9"), []);
});
