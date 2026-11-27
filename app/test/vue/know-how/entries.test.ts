// The parser and writer of the project know-how file (#4239), beyond the frozen cases of app/test/acceptation-4239/:
// punctuation and CRLF, loose lines, the last entry removed, a line number that is not an entry, and the new text refused.
import assert from "node:assert/strict";
import { test } from "node:test";
import { editEntry, entryText, KNOW_HOW_FILE, parseKnowHow, removeEntry } from "../../../src/vue/know-how/entries.ts";

const FILE = [
  "# Know-how",
  "",
  "## Conventions",
  "- Tests live next to the code (#101)",
  "- Identifiers are in French (#102)",
  "",
  "## Pitfalls",
  "- Never run the pass with a dirty tree (#205)",
  "",
  "## Tools",
  "- Use `gh api` for rate limits (#310)",
  "- A tool nobody ticketed",
  "",
].join("\n");

test("the file lives at .brigade/know-how.md", () => {
  assert.equal(KNOW_HOW_FILE, ".brigade/know-how.md");
});

test("an entry's text keeps its own punctuation and a ticket in the middle of the text", () => {
  const entries = parseKnowHow("## Pitfalls\n- Run the linter before the push. (#1234)\n- See (#12) first\n- Bare (#7)\r\n");
  assert.deepEqual(
    entries.map((e) => [e.text, e.ticket]),
    [
      ["Run the linter before the push.", 1234],
      ["See (#12) first", null],
      ["Bare", 7],
    ],
  );
});

test("a line before any heading is an entry with no section; prose and empty bullets are not entries", () => {
  assert.deepEqual(parseKnowHow("- Loose (#3)\nSome prose\n-\n- \n## Tools\n  - indented"), [{ section: "", text: "Loose", ticket: 3, line: 0 }]);
});

test("editEntry keeps a CRLF line ending", () => {
  assert.equal(editEntry("## Tools\r\n- Old (#4)\r\n", 1, "New"), "## Tools\r\n- New (#4)\r\n");
});

test("removeEntry of the last entry leaves its section heading and no entry", () => {
  const lastOne = removeEntry("## Tools\n- Only (#9)\n", 1);
  assert.equal(lastOne, "## Tools\n");
  assert.deepEqual(parseKnowHow(lastOne), []);
});

test("a line that is not an entry is never rewritten nor removed", () => {
  for (const line of [-1, 0, 2, 5, 12, 13, 1.5]) {
    assert.throws(() => editEntry(FILE, line, "x"), /is not an entry/);
    assert.throws(() => removeEntry(FILE, line), /is not an entry/);
  }
  assert.throws(() => removeEntry("", 0), /line 1 of \.brigade\/know-how\.md is not an entry/);
});

test("an entry's new text is one line, not empty", () => {
  assert.equal(entryText("  Keep it short "), "Keep it short");
  assert.throws(() => entryText("   "), /needs a text/);
  assert.throws(() => entryText(undefined), /needs a text/);
  assert.throws(() => entryText("two\nlines"), /one line/);
  assert.throws(() => editEntry(FILE, 3, "two\rlines"), /one line/);
  assert.throws(() => editEntry(FILE, 3, ""), /needs a text/);
});

test("an entry's new text that ends with a ticket is refused: the source ticket is kept, never doubled", () => {
  assert.throws(() => entryText("Reworded (#999)"), /names no ticket/);
  assert.throws(() => editEntry(FILE, 7, "Reworded (#999)"), /names no ticket/);
  assert.equal(entryText("See (#12) first"), "See (#12) first");
  assert.equal(editEntry(FILE, 7, "See (#12) first").split("\n")[7], "- See (#12) first (#205)");
});
