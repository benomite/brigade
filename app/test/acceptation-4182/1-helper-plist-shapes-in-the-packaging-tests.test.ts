// Test d'acceptation gelé (#4182). Critère 1 : les tests de packaging posent des auxiliaires aux plists réels d'Electron :
// les quatre dossiers « Electron Helper », et des plists avec CFBundleName seul, CFBundleDisplayName seul, les deux
// différents, et aucune des deux clés.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const folder = join(dirname(fileURLToPath(import.meta.url)), "..", "packaging");
const sources = readdirSync(folder)
  .filter((name) => name.endsWith(".test.ts"))
  .map((name) => readFileSync(join(folder, name), "utf8"))
  .join("\n");

test("the packaging fixtures build all the Electron helpers", () => {
  for (const name of ["Electron Helper", "Electron Helper (GPU)", "Electron Helper (Renderer)", "Electron Helper (Plugin)"])
    assert.ok(sources.includes(name), name);
});

test("the packaging fixtures use helper plists with a name key that is missing, mismatched or absent", () => {
  // Une forme par clé : le plist d'un auxiliaire sans CFBundleDisplayName, un sans CFBundleName, et un sans aucune des deux.
  assert.match(sources, /name[- ]only|sans CFBundleDisplayName|without CFBundleDisplayName|seulement CFBundleName|CFBundleName seul/i);
  assert.match(sources, /display[- ]?name[- ]only|sans CFBundleName|without CFBundleName|seulement CFBundleDisplayName|CFBundleDisplayName seul/i);
  assert.match(sources, /mismatch|différent|different/i);
  assert.match(sources, /neither|aucune des deux|sans clé|no name key/i);
});
