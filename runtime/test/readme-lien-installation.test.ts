import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const readme = readFileSync(new URL("../../README.md", import.meta.url), "utf8");

// brigade:guard
test("le README renvoie vers docs/installation.md", () => {
  assert.match(readme, /\]\((\.\/)?docs\/installation\.md[^)]*\)/);
});
