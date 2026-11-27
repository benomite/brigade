// Test d'acceptation gelé (#4079). Critère 1 : l'app lancée sur macOS avec la station qui tourne, la barre des menus montre
// une seule icône Brigade — le code qui la crée est à un seul endroit, app/src/tray/, et ni main.ts ni la station n'en posent une.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const SRC = join(import.meta.dirname, "../../src");
const lesFichiers = (dossier: string): string[] =>
  readdirSync(dossier, { withFileTypes: true }).flatMap((entree) => (entree.isDirectory() ? lesFichiers(join(dossier, entree.name)) : [join(dossier, entree.name)]));

test("every `new Tray(` of app/src lives in app/src/tray/, in one file", () => {
  assert.ok(existsSync(join(SRC, "tray")), "app/src/tray/ exists");
  const creent = lesFichiers(SRC)
    .filter((fichier) => /\.(ts|js|cjs|mjs)$/.test(fichier))
    .filter((fichier) => /new\s+Tray\s*\(/.test(readFileSync(fichier, "utf8")))
    .map((fichier) => fichier.slice(SRC.length + 1).replaceAll("\\", "/"));
  assert.equal(creent.length, 1, `one file creates the tray, got: ${creent.join(", ")}`);
  assert.ok(creent[0]!.startsWith("tray/"), `the tray is created under src/tray/, got: ${creent[0]}`);
});
