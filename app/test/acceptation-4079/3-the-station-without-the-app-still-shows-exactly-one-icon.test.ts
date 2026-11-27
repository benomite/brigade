// Test d'acceptation gelé (#4079). Critère 3 : la station qui tourne sans l'app, la barre des menus montre toujours une seule
// icône — le process de la station sans l'app (entry.ts) et l'app (main.ts) posent l'icône par le même module de app/src/tray/.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const SRC = join(import.meta.dirname, "../../src");
const read = (path: string) => readFileSync(join(SRC, path), "utf8");

test("the station-only process and the app both raise the icon through app/src/tray/", () => {
  assert.ok(existsSync(join(SRC, "tray")), "app/src/tray/ exists");
  const ofTray = (text: string) => /from\s+["'](\.\.?\/)+tray\/[^"']+["']|import\(\s*["'](\.\.?\/)+tray\/[^"']+["']\s*\)/.test(text);
  assert.ok(ofTray(read("main.ts")), "main.ts uses src/tray/");
  const entry = read("tray-background/entry.ts");
  const background = existsSync(join(SRC, "tray-background", "process.ts")) ? read("tray-background/process.ts") : "";
  assert.ok(ofTray(entry) || ofTray(background), "the station-only icon process uses src/tray/");
  assert.doesNotMatch(background, /new\s+Tray\s*\(/, "the station-only process does not create a second tray of its own");
});
