// Frozen acceptance test (#4239). Criterion 4: removing an entry deletes exactly that line from the file.
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseKnowHow, removeEntry } from "../../src/know-how/know-how.ts";

// The fixture file (line 0 is the title, line 4 the second Conventions entry).
const SAVOIR = ["# Know-how", "", "## Conventions", "- Tests live next to the code (#101)", "- Identifiers are in French (#102)", "", "## Pitfalls", "- Never run the pass with a dirty tree (#205)", "", "## Tools", "- Use `gh api` for rate limits (#310)", "- A tool nobody ticketed", ""].join("\\n");

test("removeEntry deletes the one line of the entry and nothing else", () => {
  const cible = parseKnowHow(SAVOIR).find((e) => e.ticket === 102);
  assert.ok(cible);
  const apres = removeEntry(SAVOIR, cible.line);
  const attendu = SAVOIR.split("\n");
  attendu.splice(cible.line, 1);
  assert.equal(apres, attendu.join("\n"));
  assert.ok(!apres.includes("Identifiers are in French"));
});
