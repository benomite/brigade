import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

test("le motif d'auteur du garde du gel admet le préfixe `brigade `", () => {
  const source = readFileSync(join(import.meta.dirname, "../../src/passe-gel-tests/gel-tests.ts"), "utf8");
  assert.ok(source.includes("/^(brigade )?manager(\\[bot\\])?$/i"));
});
