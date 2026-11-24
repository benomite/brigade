// #4163, critère 1 : un seul genre de cook dans le code — plus aucune trace du cook design.
// Test d'acceptation gelé (#3725) : lecture des fichiers de runtime/src, app/src, agents et .claude-plugin.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const RACINE = join(import.meta.dirname, "../../..");
const DOSSIERS = ["runtime/src", "app/src", "agents", ".claude-plugin"];
// The ticket's command: grep -rniE 'design[ _-]?cook|cook[ _-]?design'
const MOTIF = /design[ _-]?cook|cook[ _-]?design/i;

function fichiers(dossier: string): string[] {
  if (!existsSync(dossier)) return [];
  return readdirSync(dossier, { recursive: true, encoding: "utf8" })
    .map((f) => join(dossier, f))
    .filter((f) => statSync(f).isFile());
}

test("no file of the code names the design cook kind", () => {
  const restes: string[] = [];
  for (const d of DOSSIERS) {
    for (const f of fichiers(join(RACINE, d))) {
      if (MOTIF.test(f.slice(RACINE.length))) restes.push(`${f.slice(RACINE.length + 1)} (file name)`);
      const texte = readFileSync(f, "utf8");
      texte.split("\n").forEach((ligne, i) => {
        if (MOTIF.test(ligne)) restes.push(`${f.slice(RACINE.length + 1)}:${i + 1}`);
      });
    }
  }
  assert.deepEqual(restes, []);
});
