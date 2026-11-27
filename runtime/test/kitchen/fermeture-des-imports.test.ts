// Every file under runtime/src is reachable from kitchen/main.ts (#4712): what the kitchen does not load is dead.
// A file is reached by an import, by `new URL("./x.ts", import.meta.url)` (hooks the sandbox launches) or by a quoted sibling name ("x.ts").
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";

const SRC = resolve(import.meta.dirname, "../../src");

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? filesUnder(join(dir, entry.name)) : [join(dir, entry.name)]));
}

function closureOf(entry: string): Set<string> {
  const seen = new Set<string>();
  const todo = [entry];
  while (todo.length) {
    const file = todo.pop() as string;
    if (seen.has(file) || !file.endsWith(".ts")) continue;
    seen.add(file);
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(/(?:from|import|new URL)\s*\(?\s*["'](\.[^"']+)["']|["']([\w.-]+\.ts)["']/g)) {
      const target = resolve(dirname(file), (m[1] ?? m[2]) as string);
      if (existsSync(target)) todo.push(target);
    }
  }
  return seen;
}

test("every file under runtime/src is in the import closure of kitchen/main.ts (#4712)", () => {
  const reached = closureOf(join(SRC, "kitchen/main.ts"));
  const orphans = filesUnder(SRC).filter((file) => !reached.has(file)).map((file) => file.slice(SRC.length + 1));
  assert.deepEqual(orphans, [], "files nothing in the kitchen loads: delete them, with their tests and docs");
});
