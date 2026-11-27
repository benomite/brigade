// What the Mac launches at login (#4603): launchd → host.ts → envelope.ts → runtime/src/kitchen/main.ts. Nothing on that chain
// reaches the old runtime (runtime/src/station/main.ts and what only it imports), which #4499 deletes.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { test } from "node:test";
import { PRINCIPAL } from "../../src/workstation/role.ts";

const RUNTIME = join(import.meta.dirname, "../../../runtime");
const IMPORT = /(?:import|export)\s[^;]*?from\s+"(\.[^"]+)"|import\("(\.[^"]+)"\)/g;

// Every file of runtime/src reached from `entry` by relative imports.
function closureOf(entry: string): Set<string> {
  const seen = new Set<string>();
  const todo = [entry];
  for (let file = todo.pop(); file !== undefined; file = todo.pop()) {
    if (seen.has(file) || !existsSync(file)) continue;
    seen.add(file);
    for (const match of readFileSync(file, "utf8").matchAll(IMPORT)) todo.push(resolve(dirname(file), (match[1] ?? match[2]) as string));
  }
  return seen;
}

test("what the Mac station launches is the new kitchen, and its imports never reach the old runtime's station", () => {
  assert.equal(PRINCIPAL, join("src", "kitchen", "main.ts"));
  const reached = [...closureOf(join(RUNTIME, PRINCIPAL))].map((file) => relative(join(RUNTIME, "src"), file).replaceAll("\\", "/"));
  assert.ok(reached.includes("kitchen/kitchen.ts"));
  for (const old of ["station/main.ts", "station/station.ts", "station/geste.ts", "station/cuisine.ts", "station/new-kitchen.ts"]) assert.ok(!reached.includes(old), `${old} is imported by the kitchen`);
});

test("the launch chain's own files import nothing from the runtime", () => {
  for (const name of ["station-background/host.ts", "workstation/envelope.ts"]) assert.doesNotMatch(readFileSync(join(import.meta.dirname, "../../src", name), "utf8"), /^\s*(?:import|export)\b.*runtime\/|ofRuntime\(/m, name);
});
