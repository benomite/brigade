// #4016, critère 2 : les liaisons de la section `## Équipe multi-agents` de CLAUDE.md restent, mot pour mot, celles de `origin/main`.
// Réponse au blocage n=1 du manager : seules les liaisons comptent (jusqu'à `### Conventions of this repo`,
// que le ticket allège), et la référence est `origin/main` — `main` en local est souvent périmé ou absent.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { ENV_GIT } from "../outils.ts";

const RACINE = join(import.meta.dirname, "../../..");

// De `## Équipe multi-agents` jusqu'à `### Conventions of this repo`, ou au prochain titre de niveau 2 sans elle.
function liaisons(texte: string): string | null {
  const m = texte.match(/^## Équipe multi-agents[^\n]*\n[\s\S]*?(?=^### Conventions of this repo|^## |(?![\s\S]))/m);
  return m ? m[0] : null;
}

function lire(ref: string): string | null {
  const lu = spawnSync("git", ["show", `${ref}:CLAUDE.md`], { cwd: RACINE, env: ENV_GIT, encoding: "utf8" });
  return lu.status === 0 ? lu.stdout : null;
}

function existe(ref: string): boolean {
  return spawnSync("git", ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], { cwd: RACINE, env: ENV_GIT }).status === 0;
}

// brigade:guard
test("the bindings of the Équipe multi-agents section are kept, word for word as on origin/main", () => {
  const ref = existe("origin/main") ? "origin/main" : existe("main") ? "main" : null;
  assert.ok(ref, "neither origin/main nor main exists: the checkout must fetch origin/main (git fetch origin main)");
  const avant = lire(ref);
  assert.ok(avant, `${ref}:CLAUDE.md cannot be read`);
  const attendues = liaisons(avant);
  assert.ok(attendues, `${ref}'s CLAUDE.md has the Équipe multi-agents section`);
  assert.equal(liaisons(readFileSync(join(RACINE, "CLAUDE.md"), "utf8")), attendues);
});
