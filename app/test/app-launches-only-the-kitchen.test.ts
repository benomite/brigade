// #4711 — the app runs nothing from the old runtime: of `runtime/src`, the only file an `app/src` file launches is
// `kitchen/main.ts` (workstation/role.ts, `PRINCIPAL`). A launch is a path under the runtime's `src/`, written as
// segments (`join(runtime, "src", "kitchen", "main.ts")`) or as text (`runtime/src/kitchen/main.ts`); a line that
// `import(`s it loads it in the app's process instead, which launches nothing.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, test } from "node:test";

const SRC = join(import.meta.dirname, "..", "src");
const KITCHEN = "kitchen/main.ts";
const SEGMENTS = /"src"\s*,\s*((?:"[\w.-]+"\s*,?\s*)+)/g;
const TEXT = /runtime\/src\/([\w./-]+\.ts)/g;

// The `runtime/src` files a source launches, relative to `runtime/src`.
export function launchedBy(source: string): string[] {
  const launched: string[] = [];
  for (const line of source.split("\n")) {
    if (/^\s*(?:\/\/|\*|\/\*)/.test(line) || /\bimport\(|^\s*(?:import|export)\b.*\bfrom\b/.test(line)) continue;
    for (const [, segments] of line.matchAll(SEGMENTS)) launched.push([...(segments as string).matchAll(/"([^"]+)"/g)].map(([, segment]) => segment).join("/"));
    for (const [, path] of line.matchAll(TEXT)) launched.push(path as string);
  }
  return launched;
}

function sources(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? sources(join(folder, entry.name)) : /\.(?:ts|js|cjs|mjs)$/.test(entry.name) ? [join(folder, entry.name)] : []));
}

describe("#4711 — app/src launches nothing from runtime/src but the kitchen", () => {
  test("every runtime/src file an app/src file launches is kitchen/main.ts", () => {
    const launches = sources(SRC).flatMap((file) => launchedBy(readFileSync(file, "utf8")).map((launched) => ({ file: relative(SRC, file).replaceAll("\\", "/"), launched })));
    assert.ok(launches.some(({ launched }) => launched === KITCHEN), "the kitchen is no longer launched: the scan reads nothing");
    assert.deepEqual(
      launches.filter(({ launched }) => launched !== KITCHEN),
      [],
    );
  });

  test("it goes red when an app/src file launches a runtime/src file outside kitchen/", () => {
    assert.deepEqual(launchedBy('const a = join(runtime, "src", "station", "geste.ts");'), ["station/geste.ts"]);
    assert.deepEqual(launchedBy('execFile(node, ["runtime/src/aide.ts", name]);'), ["aide.ts"]);
    assert.deepEqual(launchedBy('export const PRINCIPAL = join("src", "kitchen", "main.ts");'), [KITCHEN]);
    assert.deepEqual(launchedBy('const m = await import(pathToFileURL(join(dir, "src", "bac-a-sable", "detection.ts")).href);'), []);
    assert.deepEqual(launchedBy('// join("src", "station", "geste.ts")'), []);
  });
});
