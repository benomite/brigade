// Acceptance test (#4350), criterion 7: with git, gh and claude all present, first-run goes on as before — nothing is shown, nothing waits.
import assert from "node:assert/strict";
import { test } from "node:test";
import { poserLesOutils, tenirLesOutils } from "../../src/vue/outils-requis/outils-requis.js";
import { Faux } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) } as never;

// brigade:guard
test("all three tools present: the screen shows nothing, no install button, and the step goes on", async () => {
  let pret = 0;
  const outils = tenirLesOutils({ pont: { outilsManquants: async () => [] }, outils: ["git", "gh", "claude"], rendre: () => {}, quandPret: () => pret++ });
  assert.equal(await outils.verifier(), true);
  assert.equal(outils.etat.manque, undefined);
  const lieu = new Faux("div");
  lieu.replaceChildren(...(poserLesOutils(doc, outils.etat, { ouvrir: () => {}, verifier: () => {} }) as Faux[]));
  assert.deepEqual(lieu.dessous("button"), []);
  assert.equal(lieu.textContent, "");
});
