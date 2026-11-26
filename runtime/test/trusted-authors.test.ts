import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const page = readFileSync(new URL("../../docs/trusted-authors.md", import.meta.url), "utf8");

test("la page liste les trois sortes d'auteurs de confiance", () => {
  assert.match(page, /\*\*The chef\*\*/);
  assert.match(page, /write access/);
  assert.match(page, /\*\*The kitchen's own agents\*\*/);
});

test("la page explique pourquoi la confiance se limite à ces auteurs", () => {
  assert.match(page, /public repository/);
  assert.match(page, /instructions/);
  assert.match(page, /lethal trifecta/);
});

test("le texte des autres auteurs attend dans le TODO du chef", () => {
  assert.match(page, /`TODO`/);
  assert.match(page, /until the chef accepts it|before the chef accepts it/);
});

test("un label posé par un auteur sans accès en écriture n'a aucun effet", () => {
  assert.match(page, /`label` set by an author without write access has no effect/);
});

test("la page renvoie au glossaire", () => {
  assert.match(page, /\]\(glossary\.md\)/);
});
