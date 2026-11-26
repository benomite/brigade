// Frozen acceptance test (#4239). Criterion 1: opening the screen for a project with a `.brigade/know-how.md` lists every entry with its section and source ticket.
// Contract, in `app/src/vue/know-how/know-how-github.ts`:
//   lireLeSavoir(client, depot, branche): Promise<{ entries: { section; text; ticket: number | null; line }[]; vide: boolean }>
// It reads `.brigade/know-how.md` of the project repository through the same GitHub client as the other screens.
import assert from "node:assert/strict";
import { test } from "node:test";
import { lireLeSavoir } from "../../src/vue/know-how/know-how-github.ts";
import type { ClientDeLaPriorite } from "../../src/priorite.ts";

// The fixture file (line 0 is the title, line 4 the second Conventions entry).
const SAVOIR = ["# Know-how", "", "## Conventions", "- Tests live next to the code (#101)", "- Identifiers are in French (#102)", "", "## Pitfalls", "- Never run the pass with a dirty tree (#205)", "", "## Tools", "- Use `gh api` for rate limits (#310)", "- A tool nobody ticketed", ""].join("\n");

test("every entry of the file comes back with its section and its source ticket", async () => {
  const client: ClientDeLaPriorite = {
    lire: async (chemin) => (chemin.includes("/contents/.brigade/know-how.md") ? { status: 200, data: { type: "file", content: Buffer.from(SAVOIR).toString("base64"), sha: "s1" } } : { status: 404, data: {} }),
    ecrire: async () => ({ status: 500, data: {} }),
  };
  const lu = await lireLeSavoir(client, "chef/parade", "main");
  assert.equal(lu.vide, false);
  assert.deepEqual(
    lu.entries.map((e) => [e.section, e.text, e.ticket]),
    [
      ["Conventions", "Tests live next to the code", 101],
      ["Conventions", "Identifiers are in French", 102],
      ["Pitfalls", "Never run the pass with a dirty tree", 205],
      ["Tools", "Use `gh api` for rate limits", 310],
      ["Tools", "A tool nobody ticketed", null],
    ],
  );
});
