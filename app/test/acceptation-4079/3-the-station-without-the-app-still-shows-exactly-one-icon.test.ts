// Test d'acceptation gelé (#4079). Critère 3 : la station qui tourne sans l'app, la barre des menus montre toujours une seule
// icône — le process de la station sans l'app (entree.ts) et l'app (main.ts) posent l'icône par le même module de app/src/tray/.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const SRC = join(import.meta.dirname, "../../src");
const lire = (chemin: string) => readFileSync(join(SRC, chemin), "utf8");

test("the station-only process and the app both raise the icon through app/src/tray/", () => {
  assert.ok(existsSync(join(SRC, "tray")), "app/src/tray/ exists");
  const deTray = (texte: string) => /from\s+["'](\.\.?\/)+tray\/[^"']+["']|import\(\s*["'](\.\.?\/)+tray\/[^"']+["']\s*\)/.test(texte);
  assert.ok(deTray(lire("main.ts")), "main.ts uses src/tray/");
  const entree = lire("tray-background/entree.ts");
  const background = existsSync(join(SRC, "tray-background", "processus.ts")) ? lire("tray-background/processus.ts") : "";
  assert.ok(deTray(entree) || deTray(background), "the station-only icon process uses src/tray/");
  assert.doesNotMatch(background, /new\s+Tray\s*\(/, "the station-only process does not create a second tray of its own");
});
