// Ticket 4085 : `connexionDite` passe la `sorte` au bouton — « switch GitHub account » est un discret — mais le geste
// reste recommandé par défaut, et le recommandé l'emporte sur la sorte. Joué devant un faux document.
import assert from "node:assert/strict";
import { test } from "node:test";
import { connectionSaid } from "../../src/vue/journey-project/connection.js";
import { Fake } from "../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) };
const action = { seConnecter() {}, ouvrirLaPage() {} };

function button(options: Parameters<typeof connectionSaid>[4]) {
  const block = new Fake("div");
  block.append(...(connectionSaid(doc, undefined, "switch", action, options) as Fake[]));
  return block.dessous("button").find((pose) => pose.textContent === "switch") ?? assert.fail("pas de bouton");
}

test("la sorte demandée dessine le bouton ; sans `recommande: false`, le geste reste recommandé", () => {
  assert.equal(button({ recommande: false, sorte: "discret" }).dataset.bouton, "discret");
  assert.equal(button({ sorte: "discret" }).dataset.bouton, "recommande");
});
