// La carte d'attente de l'app (vue/components/card-wait, ticket 2918) : le bon de « Awaiting you » et la carte de
// réponse posée dessous, bâtis sur le bon et la pastille — une seule implémentation pour tous les écrans.
import assert from "node:assert/strict";
import { test } from "node:test";
import { cardWait, cardOfAnswer } from "../../../src/vue/components/card-wait/card-wait.js";
import { Fake } from "../../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) };

test("la carte d'attente est un bon marqué, avec la pastille « awaiting you » après celle de son état", () => {
  const card = cardWait(doc, { numero: new Fake("span"), mot: "todo", etat: "awaiting", attendu: true }) as unknown as Fake;
  assert.equal(card.className, "bon");
  assert.equal(card.dataset.carte, "attente");
  const head = card.children[0] as Fake;
  assert.deepEqual(head.children.slice(1).map((pill) => (pill as Fake).dataset.pastille), ["awaiting", "awaiting"]);
  assert.equal(((head.children[2] as Fake).children[1] as Fake).textContent, "awaiting you");
});

test("une carte qui n'attend pas le chef n'a pas la pastille en mots", () => {
  const head = (cardWait(doc, { numero: new Fake("span") }) as unknown as Fake).children[0] as Fake;
  assert.equal(head.children.length, 1);
});

test("la carte de réponse porte sa sorte, sa source et sa résolution", () => {
  const github = cardOfAnswer(doc, { sorte: "product", source: "github" }) as Fake;
  assert.deepEqual([github.className, github.dataset.sorte, github.dataset.source, github.dataset.resolue], ["carte-todo", "product", "github", undefined]);
  assert.equal((cardOfAnswer(doc, { resolue: true }) as Fake).dataset.resolue, "");
});
