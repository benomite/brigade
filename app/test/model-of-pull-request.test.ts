// Le modèle de pull request (.github/pull_request_template.md, #3771) : un ticket qui change un comportement montre
// son diagramme Mermaid, et la PR de sa livraison le montre avant / après. Le modèle porte les deux sections, vides,
// et un commentaire qui dit de les supprimer toutes deux quand le ticket n'a pas de diagramme.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const PATH = join(import.meta.dirname, "../../.github/pull_request_template.md");

test("the pull request template has empty Before and After mermaid blocks and a delete-both comment", () => {
  assert.ok(existsSync(PATH), ".github/pull_request_template.md does not exist");
  const model = readFileSync(PATH, "utf8");

  const before = /^#{1,6}\s*Before\b[^\n]*\n([\s\S]*?)(?=^#{1,6}\s*After\b)/m.exec(model)?.[1];
  const after = /^#{1,6}\s*After\b[^\n]*\n([\s\S]*)$/m.exec(model)?.[1];
  assert.ok(before !== undefined, "no 'Before' heading before the 'After' one");
  assert.ok(after !== undefined, "no 'After' heading");

  for (const [name, section] of [["Before", before], ["After", after]] as const) {
    const blocks = [...section.matchAll(/^```mermaid[ \t]*\n([\s\S]*?)^```[ \t]*$/gm)];
    assert.equal(blocks.length, 1, `'${name}' must hold exactly one mermaid block`);
    assert.equal((blocks[0]?.[1] ?? "").trim(), "", `the mermaid block under '${name}' must be empty`);
    const comment = [...section.matchAll(/<!--([\s\S]*?)-->/g)].map((m) => m[1] ?? "");
    assert.ok(
      comment.some((c) => /delete/i.test(c) && /both/i.test(c) && /diagram/i.test(c)),
      `'${name}' needs a comment saying to delete both blocks when the ticket has no diagram`,
    );
  }
});
