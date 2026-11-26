// Test d'acceptation gelé (#4081). Critère 1 : au premier lancement, un écran explique l'activité de fond avant tout avis
// de macOS, avec un seul bouton pour continuer. L'écran vit dans app/src/vue/first-launch/.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const DOSSIER = join(import.meta.dirname, "../../src/vue/first-launch");
const lesFichiers = (dossier: string): string[] =>
  readdirSync(dossier, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? lesFichiers(join(dossier, e.name)) : [join(dossier, e.name)]));

test("the first-launch screen explains the background activity and macOS asking about it, with one button", () => {
  assert.ok(existsSync(DOSSIER), "app/src/vue/first-launch/ does not exist");
  const sources = lesFichiers(DOSSIER).filter((f) => /\.(ts|js|html)$/.test(f));
  assert.ok(sources.length > 0, "no screen in app/src/vue/first-launch/");
  const texte = sources.map((f) => readFileSync(f, "utf8")).join("\n");
  assert.match(texte, /background/i, "says Brigade runs in the background");
  assert.match(texte, /macOS/, "says macOS will ask about it");
  const boutons = texte.match(/createElement\(\s*["']button["']|<button\b/g) ?? [];
  assert.equal(boutons.length, 1, "exactly one button to continue");
});
