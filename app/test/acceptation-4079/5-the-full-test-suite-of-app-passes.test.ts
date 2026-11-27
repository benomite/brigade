// Test d'acceptation gelé (#4079). Critère 5 : toute la suite de app/ passe. Ici : le déplacement est fait (app/src/tray/) et
// aucun import relatif de app/src ni de app/test ne pointe plus vers un fichier absent ; la suite entière est celle de `npm test`.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";

const APP = join(import.meta.dirname, "../..");

test("app/src/tray/ exists and every relative import of app/src and app/test resolves", () => {
  assert.ok(existsSync(join(APP, "src", "tray")), "app/src/tray/ exists");
  const files = ["src", "test"].flatMap((d) => readdirSync(join(APP, d), { recursive: true, encoding: "utf8" }).map((f) => join(APP, d, f)))
    .filter((f) => /\.ts$/.test(f) && !f.includes("node_modules"));
  const broken: string[] = [];
  for (const file of files) {
    for (const [, target] of readFileSync(file, "utf8").matchAll(/(?:from\s+|import\(\s*)["'](\.\.?\/[^"']+\.(?:ts|js|cjs|mjs))["']/g)) {
      if (!existsSync(resolve(dirname(file), target!))) broken.push(`${file.slice(APP.length + 1)} → ${target}`);
    }
  }
  assert.deepEqual(broken, []);
});
