// Ticket 4085 : `connexionDite` laisse choisir la sorte du bouton de connexion (« switch GitHub account » est discret).
// Joué devant un faux document.
import assert from "node:assert/strict";
import { test } from "node:test";
import { connexionDite } from "../../src/vue/parcours-projet/connexion.js";
import { Faux } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const geste = { seConnecter() {}, ouvrirLaPage() {} };

test("avec sorte: discret, le bouton de connexion est dessiné discret", () => {
  const bloc = new Faux("div");
  bloc.append(...(connexionDite(doc, undefined, "switch", geste, { recommande: false, sorte: "discret" }) as Faux[]));
  const bouton = bloc.dessous("button").find((pose) => pose.textContent === "switch") ?? assert.fail("pas de bouton");
  assert.equal(bouton.dataset.bouton, "discret");
});
