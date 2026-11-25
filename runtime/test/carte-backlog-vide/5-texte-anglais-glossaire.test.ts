import assert from "node:assert/strict";
import { test } from "node:test";
import { creerCarteBacklogVide } from "../../src/carte-backlog-vide/carte-backlog-vide.ts";

test("the card text is in English and uses the words of docs/glossary.md", () => {
  const cartes: string[] = [];
  const carte = creerCarteBacklogVide({ envoyer: (texte: string) => void cartes.push(texte) });
  carte.boucle([]);
  const texte = cartes[0] ?? "";
  assert.ok(texte.length > 0);
  assert.doesNotMatch(texte, /[àâçéèêëîïôûùü]|\b(rien|cuisiner|plus de|le chef|backlog vide)\b/i);
  assert.match(texte, /\bbacklog\b/i);
  assert.match(texte, /\bcook\b/i);
  assert.doesNotMatch(texte, /\b(todo list|kanban|developer|worker|task|ticket queue)\b/i);
});
