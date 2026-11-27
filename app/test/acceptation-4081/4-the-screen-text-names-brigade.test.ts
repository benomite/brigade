// Test d'acceptation gelé (#4081). Critère 4 : le texte de l'écran nomme l'app « Brigade ».
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const FOLDER = join(import.meta.dirname, "../../src/vue/first-launch");

test("the first-launch screen text names the app 'Brigade'", () => {
  assert.ok(existsSync(FOLDER), "app/src/vue/first-launch/ does not exist");
  const text = readdirSync(FOLDER, { recursive: true, encoding: "utf8" })
    .filter((f) => /\.(ts|js|html)$/.test(f))
    .map((f) => readFileSync(join(FOLDER, f), "utf8"))
    .join("\n");
  assert.match(text, /["'`>][^"'`<\n]*\bBrigade\b[^"'`<\n]*["'`<]/, "a text of the screen names Brigade");
});
