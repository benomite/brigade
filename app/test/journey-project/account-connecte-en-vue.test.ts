// Ticket 4085, critère 1 : connecté, le compte (avatar ou login) est ce qui ressort dans le bloc GitHub, avec un état
// « connecté » net — pas une phrase de plus en petit. Joué devant un faux document.
import assert from "node:assert/strict";
import { test } from "node:test";
import { poserLeAccount, type ActionsDuAccount } from "../../src/vue/journey-project/account.js";
import { Faux } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const actions: ActionsDuAccount = { seConnecter() {}, changerDeCompte() {}, relireLeCompte() {}, ouvrirLaPage() {} };

test("connecté, le compte ressort (avatar ou login en évidence) et l'état « connecté » se dit à part", () => {
  const bloc = new Faux("div");
  bloc.append(...(poserLeAccount(doc, { compte: { login: "octo-chef" } }, actions) as Faux[]));

  const avatar = bloc.dessous("img");
  const login = [...bloc.dessous("strong"), ...bloc.dessous("b"), ...bloc.dessous("h3"), ...bloc.dessous("h4"), ...bloc.dessous("span")].filter((pose) => pose.textContent === "octo-chef");
  assert.ok(avatar.length > 0 || login.length > 0, "ni avatar ni login posé en propre dans le bloc");

  const state = bloc.dessous("span").filter((pose) => /^connected$/i.test(pose.textContent.trim()));
  assert.equal(state.length, 1, "pas d'étiquette d'état « connected » à part du compte");
});
