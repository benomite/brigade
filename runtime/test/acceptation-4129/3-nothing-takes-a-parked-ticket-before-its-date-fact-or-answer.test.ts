// #4129, critère 3 : rien ne prend un ticket parked avant : ni station, ni réparation, ni superviseur.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const RACINE = join(import.meta.dirname, "../../..");

test("the supervisor doc says a parked ticket is taken by no station, no repair and no supervisor", () => {
  const doc = readFileSync(join(RACINE, "docs/runtime/exploitation.md"), "utf8");
  const section = doc.split(/\n(?=#+ )/).find((s) => /^#+ .*parked/i.test(s));
  assert.ok(section, "no section about parked in docs/runtime/exploitation.md");
  assert.match(section, /station/i);
  assert.match(section, /repair/i);
  assert.match(section, /supervisor/i);
  assert.match(section, /never|no |nothing/i);
});

test("the rail's repair no longer puts a ticket back on `fire` by itself", () => {
  const rail = readFileSync(join(RACINE, "runtime/src/rail.ts"), "utf8");
  assert.match(rail, /parked/, "the rail does not know the parked state");
});
