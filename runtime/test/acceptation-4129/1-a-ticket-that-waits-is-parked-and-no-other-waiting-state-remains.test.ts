// #4129, critère 1 : un ticket qui attend quelqu'un est parked (qui, pour quoi, jusqu'à quand) ; aucun autre état d'attente, aucune bannière de faute.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { ETIQUETTES } from "../../src/etiquettes.ts";

const RACINE = join(import.meta.dirname, "../../..");

test("the label catalogue has `parked` and none of the old waiting labels", () => {
  const noms = ETIQUETTES.map((e) => e.name);
  assert.ok(noms.includes("parked"), "no `parked` label");
  for (const ancien of ["waiting", "set-aside:failures", "blocked-on-human", "decision", "product-question"]) {
    assert.ok(!noms.includes(ancien), `the old waiting state \`${ancien}\` is still a label`);
  }
});

test("the glossary defines parked as who, for what, until when (a date or a fact)", () => {
  const glossaire = readFileSync(join(RACINE, "docs/glossary.md"), "utf8");
  const ligne = glossaire.split("\n").find((l) => /parked/i.test(l));
  assert.ok(ligne, "the glossary does not define `parked`");
  assert.match(ligne, /who/i);
  assert.match(ligne, /what|for/i);
  assert.match(ligne, /until/i);
  assert.match(ligne, /date/i);
  assert.match(ligne, /fact/i);
});
