// Le modèle de pull request (.github/pull_request_template.md, #3771) : un ticket qui change un comportement montre
// son diagramme Mermaid, et la PR de sa livraison le montre avant / après. Le modèle porte les deux sections, vides,
// et un commentaire qui dit de les supprimer toutes deux quand le ticket n'a pas de diagramme.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const CHEMIN = join(import.meta.dirname, "../../.github/pull_request_template.md");

test("the pull request template has empty Before and After mermaid blocks and a delete-both comment", () => {
  assert.ok(existsSync(CHEMIN), ".github/pull_request_template.md does not exist");
  const modele = readFileSync(CHEMIN, "utf8");

  const avant = /^#{1,6}\s*Before\b[^\n]*\n([\s\S]*?)(?=^#{1,6}\s*After\b)/m.exec(modele)?.[1];
  const apres = /^#{1,6}\s*After\b[^\n]*\n([\s\S]*)$/m.exec(modele)?.[1];
  assert.ok(avant !== undefined, "no 'Before' heading before the 'After' one");
  assert.ok(apres !== undefined, "no 'After' heading");

  for (const [name, section] of [["Before", avant], ["After", apres]] as const) {
    const blocs = [...section.matchAll(/^```mermaid[ \t]*\n([\s\S]*?)^```[ \t]*$/gm)];
    assert.equal(blocs.length, 1, `'${name}' must hold exactly one mermaid block`);
    assert.equal((blocs[0]?.[1] ?? "").trim(), "", `the mermaid block under '${name}' must be empty`);
    const comment = [...section.matchAll(/<!--([\s\S]*?)-->/g)].map((m) => m[1] ?? "");
    assert.ok(
      comment.some((c) => /delete/i.test(c) && /both/i.test(c) && /diagram/i.test(c)),
      `'${name}' needs a comment saying to delete both blocks when the ticket has no diagram`,
    );
  }
});
