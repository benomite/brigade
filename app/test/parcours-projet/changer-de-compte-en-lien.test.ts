// Ticket 4085, critère 2 : changer de compte s'offre comme un petit lien secondaire, pas comme un bouton qui a l'air
// de la suite du parcours. Joué devant un faux document.
import assert from "node:assert/strict";
import { test } from "node:test";
import { CHANGER_DE_COMPTE, poserLeCompte, type GestesDuCompte } from "../../src/vue/parcours-projet/compte.js";
import { Faux } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };

test("connecté, « switch GitHub account » est un lien discret, et son clic change de compte", () => {
  const faits: string[] = [];
  const gestes: GestesDuCompte = { seConnecter() {}, changerDeCompte: () => void faits.push("changer"), relireLeCompte() {}, ouvrirLaPage() {} };
  const bloc = new Faux("div");
  bloc.append(...(poserLeCompte(doc, { compte: { login: "octo-chef" } }, gestes) as Faux[]));

  const geste = [...bloc.dessous("a"), ...bloc.dessous("button")].find((pose) => pose.textContent === CHANGER_DE_COMPTE) ?? assert.fail("pas de geste « switch GitHub account »");
  const estUnLien = geste.balise === "a" || geste.dataset.bouton === "discret" || /lien|link/.test(geste.className);
  assert.ok(estUnLien, `un bouton plein (${geste.balise}, ${geste.dataset.bouton ?? "?"}), pas un lien`);
  assert.notEqual(geste.className, "recommande");
  assert.notEqual(geste.dataset.bouton, "recommande");
  geste.click();
  assert.deepEqual(faits, ["changer"]);
});
