import assert from "node:assert/strict";
import { test } from "node:test";
import { baseOf, epicBranch } from "../src/epics.ts";

const ticket = { number: 1, title: "t", labels: [], trusted: true, dependsOn: [] };

test("a child's base is its epic's branch; any other ticket's is the base branch", () => {
  assert.equal(epicBranch(7), "epic/7");
  assert.equal(baseOf({ ...ticket, epic: 7 }, "main"), "epic/7");
  assert.equal(baseOf(ticket, "main"), "main");
});
