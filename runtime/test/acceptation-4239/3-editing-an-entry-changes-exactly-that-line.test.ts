// Frozen acceptance test (#4239). Criterion 3: editing an entry and saving changes exactly that line, and keeps the source ticket.
// Contract, in runtime/src/know-how/know-how.ts: parseKnowHow(text) -> { section, text, ticket: number | null, line: number (0-based index in the file) }[];
// editEntry(text, line, newText) -> string (keeps the entry's ` (#ticket)`); removeEntry(text, line) -> string.
import assert from "node:assert/strict";
import { test } from "node:test";
import { editEntry, parseKnowHow } from "../../src/know-how/know-how.ts";

// The fixture file (line 0 is the title, line 4 the second Conventions entry).
const SAVOIR = ["# Know-how", "", "## Conventions", "- Tests live next to the code (#101)", "- Identifiers are in French (#102)", "", "## Pitfalls", "- Never run the pass with a dirty tree (#205)", "", "## Tools", "- Use `gh api` for rate limits (#310)", "- A tool nobody ticketed", ""].join("\n");

test("editEntry rewrites the text of one entry, keeps its ticket, and leaves every other line byte for byte", () => {
  const cible = parseKnowHow(SAVOIR).find((e) => e.ticket === 205);
  assert.ok(cible);
  const apres = editEntry(SAVOIR, cible.line, "Never run the pass on a dirty worktree");
  const avant = SAVOIR.split("\n");
  const lignes = apres.split("\n");
  assert.equal(lignes.length, avant.length);
  const changees = lignes.flatMap((l, i) => (l === avant[i] ? [] : [i]));
  assert.deepEqual(changees, [cible.line]);
  assert.equal(lignes[cible.line], "- Never run the pass on a dirty worktree (#205)");
});
