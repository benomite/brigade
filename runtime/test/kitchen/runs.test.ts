// A run is alive while its relay is (#4661): one whose relay is still being spawned, its cmdline still the
// kitchen's own, is running, not a cook gone.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { listRuns } from "../../src/kitchen/runs.ts";

const run = (root: string, name: string, pid: number) => {
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "meta.json"), JSON.stringify({ kind: "cook", issue: 1, pr: null, started: Date.now(), worktree: null }));
  writeFileSync(join(dir, "relay.json"), JSON.stringify({ pid, run: name }));
};

test("a relay not yet exec'd, whose cmdline is still the kitchen's, is running; a dead relay is gone", () => {
  const root = mkdtempSync(join(tmpdir(), "runs-"));
  // This process stands for the relay between spawn and exec: its cmdline is the kitchen's (this test's) own.
  run(root, "cook-1", process.pid);
  run(root, "cook-2", 2 ** 22 + 7);
  const { running, finished } = listRuns(root);
  assert.deepEqual(running.map((one) => one.name), ["cook-1"]);
  assert.deepEqual(finished.map((one) => [one.name, one.end.erreur]), [["cook-2", "its relay is gone"]]);
});
