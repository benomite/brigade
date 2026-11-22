// #4016, critère 2 : la section `## Équipe multi-agents` de CLAUDE.md reste, mot pour mot, celle de `main`.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const RACINE = join(import.meta.dirname, "../../..");

// De `## Équipe multi-agents` jusqu'au prochain titre de niveau 2 (les `###` en font partie).
function section(texte: string): string | null {
  const m = texte.match(/^## Équipe multi-agents[^\n]*\n[\s\S]*?(?=^## |(?![\s\S]))/m);
  return m ? m[0] : null;
}

// brigade:guard
test("the Équipe multi-agents section is kept, word for word as on main", () => {
  const avant = execFileSync("git", ["show", "main:CLAUDE.md"], { cwd: RACINE, encoding: "utf8" });
  const maintenant = readFileSync(join(RACINE, "CLAUDE.md"), "utf8");
  const attendue = section(avant);
  assert.ok(attendue, "main's CLAUDE.md has the section");
  assert.equal(section(maintenant), attendue);
});
