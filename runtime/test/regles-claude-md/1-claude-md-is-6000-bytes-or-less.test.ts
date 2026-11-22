// #4016, critère 1 : `wc -c CLAUDE.md` affiche 6000 ou moins.
import assert from "node:assert/strict";
import { statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

test("CLAUDE.md weighs 6000 bytes or less", () => {
  const { size } = statSync(join(import.meta.dirname, "../../../CLAUDE.md"));
  assert.ok(size <= 6000, `CLAUDE.md is ${size} bytes, the limit is 6000`);
});
