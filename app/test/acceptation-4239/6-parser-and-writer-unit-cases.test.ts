// Frozen acceptance test (#4239). Criterion 6: unit tests cover the parser and writer — several sections, a line without ticket, an empty file.
// Here the contract of the parser and writer on exactly those three cases; the cook's own unit tests live in app/test/vue/know-how/entries.test.ts.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { editEntry, parseKnowHow, removeEntry } from "../../src/vue/know-how/entries.ts";

// The fixture file (line 0 is the title, line 4 the second Conventions entry).
const SAVOIR = ["# Know-how", "", "## Conventions", "- Tests live next to the code (#101)", "- Identifiers are in French (#102)", "", "## Pitfalls", "- Never run the pass with a dirty tree (#205)", "", "## Tools", "- Use `gh api` for rate limits (#310)", "- A tool nobody ticketed", ""].join("\n");

test("several sections: each entry carries its section and ticket", () => {
  const vus = parseKnowHow(SAVOIR).map((e) => [e.section, e.text, e.ticket]);
  assert.deepEqual(vus, [
    ["Conventions", "Tests live next to the code", 101],
    ["Conventions", "Identifiers are in French", 102],
    ["Pitfalls", "Never run the pass with a dirty tree", 205],
    ["Tools", "Use `gh api` for rate limits", 310],
    ["Tools", "A tool nobody ticketed", null],
  ]);
});

test("a line without ticket is edited and removed without inventing a ticket", () => {
  const sans = parseKnowHow(SAVOIR).find((e) => e.ticket === null);
  assert.ok(sans);
  assert.ok(editEntry(SAVOIR, sans.line, "Reworded").split("\n").includes("- Reworded"));
  assert.ok(!removeEntry(SAVOIR, sans.line).includes("nobody ticketed"));
});

test("an empty file has no entry and the writer does not crash on it", () => {
  assert.deepEqual(parseKnowHow(""), []);
  assert.deepEqual(parseKnowHow("## Conventions\n\n## Pitfalls\n\n## Tools\n"), []);
});

test("the parser and writer have their own unit tests in app/test/vue/know-how/", () => {
  assert.ok(existsSync(join(import.meta.dirname, "../vue/know-how/entries.test.ts")), "app/test/vue/know-how/entries.test.ts must exist");
});
