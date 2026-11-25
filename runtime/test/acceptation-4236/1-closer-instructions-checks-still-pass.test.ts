// #4236, critère 1 : si le dépôt a une éval ou un test qui vérifie les instructions du closer, il passe encore.
// Test d'acceptation : le dépôt n'a pas de test dédié au closer ; on garde ce que vérifient les instructions
// d'agents (frontmatter lisible, nom = fichier) et, une fois créé, agents/closer.md doit les respecter aussi.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

const AGENTS = new URL("../../../agents/", import.meta.url);

// brigade:guard
test("every agent instruction file, closer included, keeps a readable frontmatter", () => {
  const fichiers = readdirSync(AGENTS).filter((nom) => nom.endsWith(".md"));
  assert.ok(fichiers.length >= 1, "no agent file");
  for (const nom of fichiers) {
    const texte = readFileSync(new URL(nom, AGENTS), "utf8");
    const entete = texte.match(/^---\n([\s\S]*?)\n---\n/);
    assert.ok(entete, `${nom} has no frontmatter`);
    assert.match(entete[1]!, /^name:\s*\S+/m, `${nom} has no name`);
    assert.match(entete[1]!, /^description:\s*\S+/m, `${nom} has no description`);
  }
});
