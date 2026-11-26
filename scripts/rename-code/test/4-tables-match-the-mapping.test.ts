// The French → English table is written in three places (#4411): the data the
// rename and the gate read (`mapping.json`), the naming rule and the tool's
// README. The two tables print the data, row for row.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { readMapping, WORDS } from "../table.ts";

const ROOT = join(import.meta.dirname, "..", "..", "..");

// The `| `fr` | `en` |` rows of a markdown file, in order.
const rows = (file: string): [string, string][] =>
  [...readFileSync(join(ROOT, file), "utf8").matchAll(/^\| `([^`]+)` \| `([^`]+)` \|$/gm)].map((m) => [m[1]!, m[2]!]);

test("the naming rule and the README print the mapping the rename applies, row for row", () => {
  const mapping = readMapping();
  const expected = [...Object.entries(mapping.glossary), ...Object.entries(mapping.code)];
  assert.deepEqual(Object.entries(WORDS).sort(), [...expected].sort());
  for (const file of ["docs/naming-rule.md", "scripts/rename-code/README.md"]) {
    assert.deepEqual(rows(file), expected, file);
  }
});
