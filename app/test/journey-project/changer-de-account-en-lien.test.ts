// Ticket 4085, critère 2 : changer de compte s'offre comme un petit lien secondaire, pas comme un bouton qui a l'air
// de la suite du parcours. Joué devant un faux document.
import assert from "node:assert/strict";
import { test } from "node:test";
import { CHANGER_DE_ACCOUNT, poserLeAccount, type ActionsDuAccount } from "../../src/vue/journey-project/account.js";
import { Faux } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };

test("connecté, « switch GitHub account » est un lien discret, et son clic change de compte", () => {
  const facts: string[] = [];
  const actions: ActionsDuAccount = { seConnecter() {}, changerDeCompte: () => void facts.push("changer"), relireLeCompte() {}, ouvrirLaPage() {} };
  const bloc = new Faux("div");
  bloc.append(...(poserLeAccount(doc, { compte: { login: "octo-chef" } }, actions) as Faux[]));

  const action = [...bloc.dessous("a"), ...bloc.dessous("button")].find((pose) => pose.textContent === CHANGER_DE_ACCOUNT) ?? assert.fail("pas de geste « switch GitHub account »");
  const estUnLien = action.balise === "a" || action.dataset.bouton === "discret" || /lien|link/.test(action.className);
  assert.ok(estUnLien, `un bouton plein (${action.balise}, ${action.dataset.bouton ?? "?"}), pas un lien`);
  assert.notEqual(action.className, "recommande");
  assert.notEqual(action.dataset.bouton, "recommande");
  action.click();
  assert.deepEqual(facts, ["changer"]);
});
