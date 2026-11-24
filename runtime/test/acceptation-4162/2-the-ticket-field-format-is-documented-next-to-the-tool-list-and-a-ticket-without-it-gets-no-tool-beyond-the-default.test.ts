// #4162, critère 2 : le format du champ du ticket est documenté à côté de la liste des outils du projet ; sans champ, aucun outil au-delà du défaut.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { outilsDuCook } from "../../src/outils-du-cook.ts";

const RACINE = join(import.meta.dirname, "../../..");

test("the doc describes the ticket's tools field in the same section as the project's `tools` key", () => {
  const doc = readFileSync(join(RACINE, "docs/reglages.md"), "utf8");
  const debut = doc.search(/^\|\s*`tools`\s*\|/m);
  assert.ok(debut >= 0, "no `tools` row in docs/reglages.md");
  const suite = doc.slice(debut, debut + 4000);
  assert.match(suite, /ticket/i);
  assert.match(suite, /Tools:|`tools`.*ticket|ticket.*field/i, "the ticket field is not documented next to the tool list");
});

test("a ticket without the field gets no tool beyond the project's default", () => {
  const resultat = outilsDuCook({ projet: { tools: ["screenshots", "browser"] }, corpsDuTicket: "## Context\n\nNothing about tools.\n" });
  assert.deepEqual(resultat.outils, []);
  assert.deepEqual(resultat.manquants, []);
});
