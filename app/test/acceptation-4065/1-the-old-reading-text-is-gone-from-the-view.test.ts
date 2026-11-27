// Test d'acceptation gelé (#4065). Critère 1 : l'ancien texte n'est plus nulle part dans app/src/vue/ (grep ne rend rien).
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const VUE = join(import.meta.dirname, "../../src/vue");
const OLD = "Reading the stations you have paired, on GitHub…";
const theFiles = (folder: string): string[] =>
  readdirSync(folder, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? theFiles(join(folder, entry.name)) : [join(folder, entry.name)]));

test("the old text « Reading the stations you have paired, on GitHub… » is gone from app/src/vue/", () => {
  const found = theFiles(VUE).filter((file) => {
    const text = readFileSync(file, "utf8");
    return text.includes(OLD) || text.includes("the stations you have paired, on GitHub");
  });
  assert.deepEqual(found, []);
});
