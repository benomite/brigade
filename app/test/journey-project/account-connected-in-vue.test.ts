// Ticket 4085, critère 1 : connecté, le compte (avatar ou login) est ce qui ressort dans le bloc GitHub, avec un état
// « connecté » net — pas une phrase de plus en petit. Joué devant un faux document.
import assert from "node:assert/strict";
import { test } from "node:test";
import { setTheAccount, type ActionsOfAccount } from "../../src/vue/journey-project/account.js";
import { Fake } from "../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) };
const actions: ActionsOfAccount = { seConnecter() {}, changerDeCompte() {}, relireLeCompte() {}, ouvrirLaPage() {} };

test("connecté, le compte ressort (avatar ou login en évidence) et l'état « connecté » se dit à part", () => {
  const block = new Fake("div");
  block.append(...(setTheAccount(doc, { compte: { login: "octo-chef" } }, actions) as Fake[]));

  const avatar = block.dessous("img");
  const login = [...block.dessous("strong"), ...block.dessous("b"), ...block.dessous("h3"), ...block.dessous("h4"), ...block.dessous("span")].filter((pose) => pose.textContent === "octo-chef");
  assert.ok(avatar.length > 0 || login.length > 0, "ni avatar ni login posé en propre dans le bloc");

  const state = block.dessous("span").filter((pose) => /^connected$/i.test(pose.textContent.trim()));
  assert.equal(state.length, 1, "pas d'étiquette d'état « connected » à part du compte");
});
