// #4016, critère 2 : les liaisons de la section `## Équipe multi-agents` de CLAUDE.md restent, mot pour mot, celles de `origin/main`.
// Changé sur décision du manager (#4016, commentaire `brigade:reponse-au-blocage n=1`, 2026-11-22T16:24:05Z) :
// « The cook may edit the frozen test […] It must compare only the bindings part […] It must read the
// reference from `origin/main`, and fall back to `main` only if `origin/main` does not exist. »
// Seules les liaisons comptent (jusqu'à `### Conventions of this repo`, que le ticket allège).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { ENV_GIT } from "../outils.ts";

const RACINE = join(import.meta.dirname, "../../..");

// De `## Équipe multi-agents` jusqu'à `### Conventions of this repo`, ou au prochain titre de niveau 2 sans elle.
// Fins de ligne ramenées à `\n` : un checkout Windows peut écrire CLAUDE.md en `\r\n`, `git show` le rend en `\n`.
function liaisons(texte: string): string | null {
  const m = texte.replace(/\r\n/g, "\n").match(/^## Équipe multi-agents[^\n]*\n[\s\S]*?(?=^### Conventions of this repo|^## |(?![\s\S]))/m);
  return m ? m[0] : null;
}

// #4164 réécrit, avec la règle 4 du process simplifié, la ligne Interface et la ligne App (le cook design n'existe plus) :
// ces deux lignes sont écartées de la comparaison, le reste des liaisons reste mot pour mot celui de `origin/main`.
// #4331 réécrit de même la ligne Runtime de Dev local (ses tests : les gates, jamais une suite entière) : elle est écartée aussi.
function sansReecrites(texte: string | null): string | null {
  return texte === null ? null : texte.split("\n").filter((l) => !l.startsWith("- **Interface**") && !l.startsWith("  - **App**") && !l.startsWith("  - **Runtime** — Node 26, no build.")).join("\n");
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
  const attendues = sansReecrites(liaisons(avant));
  assert.ok(attendues, `${ref}'s CLAUDE.md has the Équipe multi-agents section`);
  assert.equal(sansReecrites(liaisons(readFileSync(join(RACINE, "CLAUDE.md"), "utf8"))), attendues);
});
