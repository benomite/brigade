// Test d'acceptation gelé (#4065). Critère 1 : l'ancien texte n'est plus nulle part dans app/src/vue/ (grep ne rend rien).
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const VUE = join(import.meta.dirname, "../../src/vue");
const VIEUX = "Reading the stations you have paired, on GitHub…";
const lesFichiers = (dossier: string): string[] =>
  readdirSync(dossier, { withFileTypes: true }).flatMap((entree) => (entree.isDirectory() ? lesFichiers(join(dossier, entree.name)) : [join(dossier, entree.name)]));

test("the old text « Reading the stations you have paired, on GitHub… » is gone from app/src/vue/", () => {
  const trouves = lesFichiers(VUE).filter((fichier) => {
    const texte = readFileSync(fichier, "utf8");
    return texte.includes(VIEUX) || texte.includes("the stations you have paired, on GitHub");
  });
  assert.deepEqual(trouves, []);
});
