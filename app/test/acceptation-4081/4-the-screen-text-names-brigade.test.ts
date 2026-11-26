// Test d'acceptation gelé (#4081). Critère 4 : le texte de l'écran nomme l'app « Brigade ».
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const DOSSIER = join(import.meta.dirname, "../../src/vue/first-launch");

test("the first-launch screen text names the app 'Brigade'", () => {
  assert.ok(existsSync(DOSSIER), "app/src/vue/first-launch/ does not exist");
  const texte = readdirSync(DOSSIER, { recursive: true, encoding: "utf8" })
    .filter((f) => /\.(ts|js|html)$/.test(f))
    .map((f) => readFileSync(join(DOSSIER, f), "utf8"))
    .join("\n");
  assert.match(texte, /["'`>][^"'`<\n]*\bBrigade\b[^"'`<\n]*["'`<]/, "a text of the screen names Brigade");
});
