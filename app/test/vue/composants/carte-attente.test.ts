// La carte d'attente de l'app (vue/composants/carte-attente, ticket 2918) : le bon de « Awaiting you » et la carte de
// réponse posée dessous, bâtis sur le bon et la pastille — une seule implémentation pour tous les écrans.
import assert from "node:assert/strict";
import { test } from "node:test";
import { carteAttente, carteDeReponse } from "../../../src/vue/composants/carte-attente/carte-attente.js";
import { Faux } from "../../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };

test("la carte d'attente est un bon marqué, avec la pastille « awaiting you » après celle de son état", () => {
  const carte = carteAttente(doc, { numero: new Faux("span"), mot: "todo", etat: "awaiting", attendu: true }) as unknown as Faux;
  assert.equal(carte.className, "bon");
  assert.equal(carte.dataset.carte, "attente");
  const tete = carte.children[0] as Faux;
  assert.deepEqual(tete.children.slice(1).map((pastille) => (pastille as Faux).dataset.pastille), ["awaiting", "awaiting"]);
  assert.equal(((tete.children[2] as Faux).children[1] as Faux).textContent, "awaiting you");
});

test("une carte qui n'attend pas le chef n'a pas la pastille en mots", () => {
  const tete = (carteAttente(doc, { numero: new Faux("span") }) as unknown as Faux).children[0] as Faux;
  assert.equal(tete.children.length, 1);
});

test("la carte de réponse porte sa sorte, sa source et sa résolution", () => {
  const github = carteDeReponse(doc, { sorte: "product", source: "github" }) as Faux;
  assert.deepEqual([github.className, github.dataset.sorte, github.dataset.source, github.dataset.resolue], ["carte-todo", "product", "github", undefined]);
  assert.equal((carteDeReponse(doc, { resolue: true }) as Faux).dataset.resolue, "");
});
