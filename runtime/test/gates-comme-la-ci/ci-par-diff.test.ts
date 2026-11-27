// #4607: a PR runs only the CI its diff needs; Windows and the full matrix stay on `main`.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const RACINE = join(import.meta.dirname, "../../..");
const lire = (nom: string): string => readFileSync(join(RACINE, ".github/workflows", nom), "utf8");

test("the Windows suite runs on main and on demand, never on a PR", () => {
  const on = /^on:\n((?: {2}.*\n|\n)*)/m.exec(lire("runtime-windows.yml"))?.[1] ?? assert.fail("no `on:` block");
  assert.doesNotMatch(on, /pull_request/);
  assert.match(on, /push:\n {4}branches:\n {6}- main/);
});

test("the shards and the type checks of a PR come from the diff's plan, and main plays them all", () => {
  const tests = lire("tests.yml");
  assert.match(tests, /matrix: \$\{\{ fromJSON\(needs\.plan\.outputs\.tests\) \}\}/);
  assert.match(tests, /matrix: \$\{\{ fromJSON\(needs\.plan\.outputs\.types\) \}\}/);
  assert.equal((tests.match(/"zone":"runtime","of":16,"part":/g) ?? []).length, 16, "main plays the 16 runtime shards");
  assert.equal((tests.match(/"zone":"app","of":3,"part":/g) ?? []).length, 3, "main plays the 3 app shards");
  assert.match(tests, /case "\$\{\{ needs\.tests\.result \}\}" in success\|skipped\)/);
});

test("a PR that only changes docs/ plays no test shard", () => {
  assert.match(lire("tests.yml"), /changes\.filter\(Boolean\)\.every\(\(c\) => c\.startsWith\("docs\/"\)\)/);
});
