import assert from "node:assert/strict";
import { test } from "node:test";
import { dependsOn, gestures } from "../../src/kitchen/github.ts";

test("a ticket waits for every ticket its body says it depends on, is blocked by, or comes after", () => {
  assert.deepEqual(dependsOn("Part of #4497. Blocked by #4481 and #4498: take it once both are merged."), [4481, 4498]);
  assert.deepEqual(dependsOn("Depends on #12\nSee #7 for context.\nAfter #3, #4."), [12, 3, 4]);
  assert.deepEqual(dependsOn("Epic: #5\nCloses #9"), []);
});

test("adding a label the repo does not have creates it and retries; a second failure is thrown", async () => {
  const known = new Set<string>();
  const calls: string[][] = [];
  const gh = async (args: string[]) => {
    calls.push(args);
    if (args[0] === "label") { known.add(args[2]); return ""; }
    const add = args[args.indexOf("--add-label") + 1]?.split(",") ?? [];
    if (add.some((name) => !known.has(name))) throw new Error("label not found");
    return "";
  };
  await gestures(gh, "o/r").labels(7, ["parked:chef", "approved"], ["in-pass"]);
  assert.ok(known.has("approved"));
  assert.equal(calls.filter((c) => c[0] === "issue").length, 2);
  const broken = async (args: string[]) => { if (args[0] === "issue") throw new Error("boom"); return ""; };
  await assert.rejects(gestures(broken, "o/r").labels(7, ["approved"]), /boom/);
});
