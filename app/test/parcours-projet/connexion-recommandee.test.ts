// Ticket 4085 : « connect to GitHub » reste le geste recommandé quand aucun compte n'est connecté ; seul « switch GitHub
// account » est rendu discret. Joué devant un faux document.
import assert from "node:assert/strict";
import { test } from "node:test";
import { connexionDite } from "../../src/vue/parcours-projet/connexion.js";
import { Faux } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const geste = { seConnecter() {}, ouvrirLaPage() {} };

test("sans option, le bouton de connexion est le geste recommandé", () => {
  const bloc = new Faux("div");
  bloc.append(...(connexionDite(doc, undefined, "connect to GitHub", geste) as Faux[]));
  const bouton = bloc.dessous("button").find((pose) => pose.textContent === "connect to GitHub") ?? assert.fail("pas de bouton");
  assert.equal(bouton.className, "recommande");
});

test("avec recommande: false, le bouton n'est pas recommandé", () => {
  const bloc = new Faux("div");
  bloc.append(...(connexionDite(doc, undefined, "switch", geste, { recommande: false }) as Faux[]));
  const bouton = bloc.dessous("button").find((pose) => pose.textContent === "switch") ?? assert.fail("pas de bouton");
  assert.notEqual(bouton.className, "recommande");
});
