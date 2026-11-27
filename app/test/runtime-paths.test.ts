// The app carries no runtime (#4745): nothing in the app loads a runtime file by a string path — `join(locations.runtime, …)`,
// `ofRuntime(…)` — and the packaging copies none. TypeScript does not check those paths (#4528), so a text scan keeps them out.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const SRC = join(import.meta.dirname, "..", "src");
const walk = (path: string): string[] => (statSync(path).isDirectory() ? readdirSync(path).flatMap((name) => walk(join(path, name))) : [path]);

test("no file of the app loads a runtime file by a string path", () => {
  const found = walk(SRC)
    .filter((path) => path.endsWith(".ts"))
    .flatMap((path) => (/ofRuntime\(|ofRuntime<|locations\.runtime|RUNTIME_OF_PACKAGE/.test(readFileSync(path, "utf8")) ? [path] : []));
  assert.deepEqual(found, []);
});
