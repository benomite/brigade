// station/configuration.ts reads the station's configuration without decisions.ts, reglages-projet/ or runtime.ts (#4774): its closure of value imports reaches none of them.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";

const SRC = resolve(import.meta.dirname, "../../src");

function closureOf(entry: string): Set<string> {
  const seen = new Set<string>();
  const todo = [entry];
  while (todo.length) {
    const file = todo.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const m of readFileSync(file, "utf8").matchAll(/^(?:import|export)(?! type)[^;]*?from\s+"(\.[^"]+)"/gm)) {
      const target = resolve(dirname(file), m[1] as string);
      if (existsSync(target)) todo.push(target);
    }
  }
  return seen;
}

test("station/configuration.ts reaches neither decisions.ts, reglages-projet/ nor runtime.ts (#4774)", () => {
  const reached = [...closureOf(resolve(SRC, "station/configuration.ts"))].map((file) => file.slice(SRC.length + 1));
  assert.deepEqual(reached.filter((file) => file === "decisions.ts" || file === "runtime.ts" || file.startsWith("reglages-projet/")), []);
});
