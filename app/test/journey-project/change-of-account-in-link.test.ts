// Ticket 4085, critère 2 : changer de compte s'offre comme un petit lien secondaire, pas comme un bouton qui a l'air
// de la suite du parcours. Joué devant un faux document.
import assert from "node:assert/strict";
import { test } from "node:test";
import { CHANGE_OF_ACCOUNT, setTheAccount, type ActionsOfAccount } from "../../src/vue/journey-project/account.js";
import { Fake } from "../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) };

test("connecté, « switch GitHub account » est un lien discret, et son clic change de compte", () => {
  const facts: string[] = [];
  const actions: ActionsOfAccount = { seConnecter() {}, changerDeCompte: () => void facts.push("changer"), relireLeCompte() {}, ouvrirLaPage() {} };
  const block = new Fake("div");
  block.append(...(setTheAccount(doc, { compte: { login: "octo-chef" } }, actions) as Fake[]));

  const action = [...block.dessous("a"), ...block.dessous("button")].find((pose) => pose.textContent === CHANGE_OF_ACCOUNT) ?? assert.fail("pas de geste « switch GitHub account »");
  const isOneLink = action.balise === "a" || action.dataset.bouton === "discret" || /lien|link/.test(action.className);
  assert.ok(isOneLink, `un bouton plein (${action.balise}, ${action.dataset.bouton ?? "?"}), pas un lien`);
  assert.notEqual(action.className, "recommande");
  assert.notEqual(action.dataset.bouton, "recommande");
  action.click();
  assert.deepEqual(facts, ["changer"]);
});
