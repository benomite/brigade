// Test d'acceptation gelé (#4081). Critère 1 : au premier lancement, un écran explique l'activité de fond avant tout avis
// de macOS, avec un seul bouton pour continuer. L'écran vit dans app/src/vue/first-launch/.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const FOLDER = join(import.meta.dirname, "../../src/vue/first-launch");
const theFiles = (folder: string): string[] =>
  readdirSync(folder, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? theFiles(join(folder, e.name)) : [join(folder, e.name)]));

test("the first-launch screen explains the background activity and macOS asking about it, with one button", () => {
  assert.ok(existsSync(FOLDER), "app/src/vue/first-launch/ does not exist");
  const sources = theFiles(FOLDER).filter((f) => /\.(ts|js|html)$/.test(f));
  assert.ok(sources.length > 0, "no screen in app/src/vue/first-launch/");
  const text = sources.map((f) => readFileSync(f, "utf8")).join("\n");
  assert.match(text, /background/i, "says Brigade runs in the background");
  assert.match(text, /macOS/, "says macOS will ask about it");
  const buttons = text.match(/createElement\(\s*["']button["']|<button\b/g) ?? [];
  assert.equal(buttons.length, 1, "exactly one button to continue");
});
