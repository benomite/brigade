// Test d'acceptation gelé (#4079). Critère 1 : l'app lancée sur macOS avec la station qui tourne, la barre des menus montre
// une seule icône Brigade — le code qui la crée est à un seul endroit, app/src/tray/, et ni main.ts ni la station n'en posent une.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const SRC = join(import.meta.dirname, "../../src");
const theFiles = (folder: string): string[] =>
  readdirSync(folder, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? theFiles(join(folder, entry.name)) : [join(folder, entry.name)]));

test("every `new Tray(` of app/src lives in app/src/tray/, in one file", () => {
  assert.ok(existsSync(join(SRC, "tray")), "app/src/tray/ exists");
  const create = theFiles(SRC)
    .filter((file) => /\.(ts|js|cjs|mjs)$/.test(file))
    .filter((file) => /new\s+Tray\s*\(/.test(readFileSync(file, "utf8")))
    .map((file) => file.slice(SRC.length + 1).replaceAll("\\", "/"));
  assert.equal(create.length, 1, `one file creates the tray, got: ${create.join(", ")}`);
  assert.ok(create[0]!.startsWith("tray/"), `the tray is created under src/tray/, got: ${create[0]}`);
});
