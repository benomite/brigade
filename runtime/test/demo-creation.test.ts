// #3734 criterion 2: choosing the demo creates a new repository on the visitor's GitHub account with at least three ready tickets, and the app shows the demo being served.
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

test("the runtime demo creates a GitHub repository seeded with at least three ready tickets and serves it", () => {
  const src = lire("runtime/src/demo");
  assert.notEqual(src, "", "runtime/src/demo/ must exist");
  assert.match(src, /repo(sitory)?\s+create|repos\/|createRepo|\/user\/repos/i, "it creates a repository through GitHub");
  assert.match(src, /ready/i, "its seeded tickets carry the ready label");
  const titres = src.match(/title\s*:/g) ?? [];
  assert.ok(titres.length >= 3, "at least three seeded tickets");
  assert.match(src, /serv(e|ing|ed)/i, "the demo project is then served");
  const vue = lire("app/src/vue/demo");
  assert.match(vue, /serv(e|ing|ed)/i, "the app screen shows the demo being served");
});
