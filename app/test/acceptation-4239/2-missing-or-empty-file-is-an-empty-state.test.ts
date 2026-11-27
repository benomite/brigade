// Frozen acceptance test (#4239). Criterion 2: a project with a missing or empty file shows an explicit empty state, not an error.
// `lireLeSavoir` (see test 1) does not throw on a missing or empty file: it answers `vide: true` with no entry.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readTheKnowledge } from "../../src/vue/know-how/know-how-github.ts";
import type { ClientOfThePriority } from "../../src/priority.ts";

const clientOf = (answer: { status: number; data: unknown }): ClientOfThePriority => ({ lire: async () => answer, ecrire: async () => ({ status: 500, data: {} }) });
const file = (text: string) => ({ status: 200, data: { type: "file", content: Buffer.from(text).toString("base64"), sha: "s1" } });

test("a missing file (404) is an empty state, not an error", async () => {
  const readOne = await readTheKnowledge(clientOf({ status: 404, data: { message: "Not Found" } }), "chef/parade", "main");
  assert.equal(readOne.vide, true);
  assert.deepEqual(readOne.entries, []);
});

test("an empty file, or one with section headings only, is an empty state", async () => {
  for (const text of ["", "## Conventions\n\n## Pitfalls\n\n## Tools\n"]) {
    const readOne = await readTheKnowledge(clientOf(file(text)), "chef/parade", "main");
    assert.equal(readOne.vide, true);
    assert.deepEqual(readOne.entries, []);
  }
});
