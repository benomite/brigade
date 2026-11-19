// #3734 criterion 6: from the demo project screen, one visible button 'add my own project' opens the #1908 add-project path.
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

test("the demo screen has an 'add my own project' button that opens the existing add-project path", () => {
  const vue = lire("app/src/vue/demo");
  assert.match(vue, /add my own project/i);
  assert.match(vue, /ajout-projet|ajouterProjet|add-project|Add a project/i, "it opens the existing add-project path");
  assert.ok(existsSync(join(RACINE, "app/src/vue/ajout-projet")), "the existing path is reused, not rebuilt");
});
