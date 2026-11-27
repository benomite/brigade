// The app loads runtime files by paths written as strings (`join(locations.runtime, "src", …)`, `ofRuntime(…)`):
// TypeScript does not check them, so a rename broke six of them silently and the second could not start (#4528).
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const SRC = join(import.meta.dirname, "..", "src");
const RUNTIME_SRC = join(SRC, "..", "..", "runtime", "src");

test("every runtime file the app loads by a string path exists", () => {
  const main = readFileSync(join(SRC, "main.ts"), "utf8");
  const calls = [...main.matchAll(/(?:ofRuntime(?:<[^>]*>)?\(|join\(locations\.runtime, "src", )((?:"[^"]+"(?:, )?)+)\)/g)];
  const paths = calls.map((call) => [...(call[1] ?? "").matchAll(/"([^"]+)"/g)].map((part) => part[1]).join("/"));
  // Since #4511 main.ts loads only the kitchen's files (runtime/src/kitchen/): one path found is enough to prove the pattern.
  assert.ok(paths.length > 0, "the scan found no path: its pattern no longer matches main.ts");
  assert.deepEqual(paths.filter((path) => !existsSync(join(RUNTIME_SRC, path))), []);
});
