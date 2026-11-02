import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ciDurationSection, describeCiDuration, durationSeconds, measureCiDuration, type GetJson } from "../src/measures/ci-duration.ts";

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/ci-duration/${name}.json`, import.meta.url), "utf8"));
const recorded: GetJson = async (path) => {
  if (path.includes("/pulls?")) return fixture("pulls");
  return fixture(`runs-${/commits\/(sha\d+)\//.exec(path)![1]}`);
};

test("duration runs from the first check start to the last check end", () => {
  assert.equal(durationSeconds([
    { started_at: "2026-10-10T10:00:05Z", completed_at: "2026-10-10T10:00:20Z" },
    { started_at: "2026-10-10T10:00:00Z", completed_at: "2026-10-10T10:00:10Z" },
    { started_at: null, completed_at: null },
  ]), 20);
  assert.equal(durationSeconds([]), null);
});

test("ten merges, most recent first, with median, worst and target", async () => {
  const lines = describeCiDuration(await measureCiDuration("o/r", recorded));
  assert.equal(lines.length, 13);
  assert.match(lines[1]!, /#111  /);
  assert.match(lines[1]!, /95 s  OVER TARGET/);
  assert.match(lines.at(-2)!, /median 7\d s \(target 60 s\)  OVER TARGET/);
  assert.match(lines.at(-1)!, /worst 95 s/);
  assert.doesNotMatch(lines[10]!, /OVER/);
});

test("fewer than ten merges is said in one line", async () => {
  const few: GetJson = async (path) => (path.includes("/pulls?") ? fixture("pulls").slice(0, 3) : recorded(path));
  assert.deepEqual(describeCiDuration(await measureCiDuration("o/r", few)), ["CI duration of the last 10 merges: only 3 merges available"]);
});

test("a failing GitHub call is said in one line", async () => {
  const lines = await ciDurationSection("o/r", async () => { throw new Error("gh api failed: HTTP 502"); });
  assert.deepEqual(lines, ["CI duration of the last 10 merges: unavailable (gh api failed: HTTP 502)"]);
});

test("no repository declared, no section", async () => {
  assert.deepEqual(await ciDurationSection(undefined, recorded), []);
});
