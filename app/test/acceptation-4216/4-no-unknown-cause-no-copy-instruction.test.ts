// #4216, critère 4 : aucun état du bandeau ne dit « cause is unknown » ni ne demande de copier une information dans l'onglet du second.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const DOSSIER = join(import.meta.dirname, "../../src/vue/banner-outage");

test("the bandeau-panne folder never says 'cause is unknown' nor asks to copy anything into the second's tab", () => {
  const fichiers = readdirSync(DOSSIER, { recursive: true, withFileTypes: true }).filter((f) => f.isFile());
  assert.ok(fichiers.length > 0, "the folder app/src/vue/banner-outage/ holds the banner");
  for (const f of fichiers) {
    const texte = readFileSync(join(f.parentPath, f.name), "utf8");
    assert.doesNotMatch(texte, /cause is unknown/i, f.name);
    assert.doesNotMatch(texte, /\bcopy\b|\bpaste\b|copier|coller/i, f.name);
  }
});
