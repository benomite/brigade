// Test d'acceptation gelé (#4079). Critère 4 : un test de app/test/ crée l'icône avec l'app et la station actives et vérifie
// qu'un seul objet Tray existe.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const TEST = join(import.meta.dirname, "..");

test("a test in app/test/ drives app/src/tray/ and asserts that a single Tray exists", () => {
  const candidates = readdirSync(TEST, { recursive: true, encoding: "utf8" })
    .filter((f) => f.endsWith(".test.ts") && !f.replaceAll("\\", "/").startsWith("acceptation-4079/"))
    .filter((f) => {
      const text = readFileSync(join(TEST, f), "utf8");
      return /src\/tray\//.test(text) && /Tray/.test(text) && /(assert\.(equal|strictEqual|deepEqual)\([^;]*(\.length|\bcount\b|\bcompte\b|\bcrees\b|\bcreated\b)[^;]*\b1\b|\.length,\s*1\b)/.test(text);
    });
  assert.ok(candidates.length > 0, "a test imports src/tray/ and asserts one tray");
});
