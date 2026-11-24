// #4163, critère 2 : un ticket qui veut des captures les a toujours, par la liste d'outils — pas par un genre de cook.
// Test d'acceptation gelé (#3725) : la consigne du cook.
import assert from "node:assert/strict";
import { test } from "node:test";
import { consigne } from "../../src/claude.ts";

const texte = consigne({ ticket: 4163, titre: "A screen change", depot: "benomite/brigade", base: "main" });

test("the cook's brief still asks for before/after screenshots with the capture tool", () => {
  assert.match(texte, /scripts\/capture-ecran/);
  assert.match(texte, /docs\/captures\/4163\/<écran>-avant\.png/);
  assert.match(texte, /docs\/captures\/4163\/<écran>-apres\.png/);
});

test("the screenshots are not tied to a design cook kind or its label", () => {
  assert.doesNotMatch(texte, /cook:design/);
  assert.doesNotMatch(texte, /design[ _-]?cook|cook[ _-]?design/i);
});
