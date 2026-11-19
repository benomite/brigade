// #3734 criterion 1: on first launch (no project yet), the app shows a 'try on a demo project' choice next to the usual way of adding a project.
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

test("the first-launch screen offers 'try on a demo project' next to the add-a-project way", () => {
  const demo = lire("app/src/vue/demo");
  assert.match(demo, /try on a demo project/i, "app/src/vue/demo must carry the 'try on a demo project' choice");
  // The choice is wired into the existing add-a-project / first-launch screen, which keeps its usual way.
  const accueil = lire("app/src/vue/ajout-projet") + lire("app/src/vue/accueil");
  assert.match(accueil, /demo/i, "the demo choice must be wired into the add-a-project / first-launch screen");
  assert.match(accueil, /add a project/i);
});
