// #4162, critère 1 : le projet déclare ses outils dans sa config ; l'emplacement et le format sont documentés.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const RACINE = join(import.meta.dirname, "../../..");

test("docs/reglages.md documents the `tools` key of projet.json with its format and the screenshots tool", () => {
  const doc = readFileSync(join(RACINE, "docs/reglages.md"), "utf8");
  const ligne = doc.split("\n").find((l) => /^\|\s*`tools`\s*\|/.test(l));
  assert.ok(ligne, "the project settings table has no `tools` row");
  assert.match(ligne, /list/i, "the `tools` row does not say it is a list");
  assert.match(doc, /screenshots/, "the doc does not name the screenshots tool");
});
