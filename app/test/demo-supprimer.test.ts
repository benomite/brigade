// #3734 criterion 4: one-gesture 'delete demo project', a confirmation naming the demo repository, then the project leaves the app and the repository is deleted on GitHub.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const RACINE = join(import.meta.dirname, "..", "..");
// Every source file under a folder, concatenated (empty when the folder does not exist yet).
function lire(dossier: string): string {
  const abs = join(RACINE, dossier);
  if (!existsSync(abs)) return "";
  const sortie: string[] = [];
  const marcher = (d: string) => {
    for (const nom of readdirSync(d)) {
      const p = join(d, nom);
      if (statSync(p).isDirectory()) marcher(p);
      else sortie.push(readFileSync(p, "utf8"));
    }
  };
  marcher(abs);
  return sortie.join("\n");
}

test("the app offers 'delete demo project' with a confirmation that names the repository", () => {
  const vue = lire("app/src/vue/demo");
  assert.match(vue, /delete demo project/i);
  assert.match(vue, /confirm/i);
  assert.match(vue, /repositor(y|ies)|repo\b/i);
  const src = lire("runtime/src/demo");
  assert.match(src, /DELETE|deleteRepo|repo\s+delete/, "the runtime deletes the repository on GitHub");
  assert.match(src, /remove|retire|delete/i);
});
