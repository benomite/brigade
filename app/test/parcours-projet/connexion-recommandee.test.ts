// Ticket 4085 : `connexionDite` passe la `sorte` au bouton — « switch GitHub account » est un discret — mais le geste
// reste recommandé par défaut, et le recommandé l'emporte sur la sorte. Joué devant un faux document.
import assert from "node:assert/strict";
import { test } from "node:test";
import { connexionDite } from "../../src/vue/parcours-projet/connexion.js";
import { Faux } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const geste = { seConnecter() {}, ouvrirLaPage() {} };

function bouton(options: Parameters<typeof connexionDite>[4]) {
  const bloc = new Faux("div");
  bloc.append(...(connexionDite(doc, undefined, "switch", geste, options) as Faux[]));
  return bloc.dessous("button").find((pose) => pose.textContent === "switch") ?? assert.fail("pas de bouton");
}

test("la sorte demandée dessine le bouton ; sans `recommande: false`, le geste reste recommandé", () => {
  assert.equal(bouton({ recommande: false, sorte: "discret" }).dataset.bouton, "discret");
  assert.equal(bouton({ sorte: "discret" }).dataset.bouton, "recommande");
});
