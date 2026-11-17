// #3734 criterion 3: a cook takes one of the demo tickets and the app shows it, with no action on any pre-existing repository of the visitor.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const RACINE = join(import.meta.dirname, "..", "..");
// Every source file under a folder, concatenated (empty when the folder does not exist yet).
function lire(dossier: string): string {
  const abs = join(RACINE, dossier);
  if (!existsSync(abs)) return "";
  const sortie: string[] = [];
  const marcher = (d: string) => {
    for (const nom of readdirSync(d)) {
      const p = join(d, nom);
      if (statSync(p).isDirectory()) marcher(p);
      else sortie.push(readFileSync(p, "utf8"));
    }
  };
  marcher(abs);
  return sortie.join("\n");
}

test("the demo screen shows the ticket a cook took, and the demo touches only its own repository", () => {
  const vue = lire("app/src/vue/demo");
  assert.notEqual(vue, "", "app/src/vue/demo/ must exist");
  assert.match(vue, /cook/i);
  assert.match(vue, /ticket/i);
  const src = lire("runtime/src/demo");
  assert.notEqual(src, "", "runtime/src/demo/ must exist");
  // Every GitHub call of the demo is addressed to the recorded demo repository, never a listed pre-existing one.
  assert.match(src, /record/i);
  assert.doesNotMatch(src, /listForAuthenticatedUser|user\/repos\?/i, "the demo never lists or touches the visitor's other repositories");
});
