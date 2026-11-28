// Le bon de l'app (vue/components/slip, ticket 2918) : un seul bon pour tous les écrans, bâti sur la pastille ; sa peau est
// dans sa feuille, et vue.css ne dessine plus aucun bon.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { Fake } from "../../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) };
const VUE = join(import.meta.dirname, "../../../src/vue");
const read = (file: string) => readFileSync(join(VUE, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

describe("le bon", () => {

});

describe("la feuille du bon", () => {
  test("vue.css ne dessine aucun bon, ni aucune carte d'attente", () => {
    const rules = [...read("vue.css").matchAll(/([^{}]+)\{/g)].map(([, head = ""]) => head.trim()).filter((head) => /\.bon\b|carte-todo|data-attend|envoi-en-attente/.test(head));
    assert.deepEqual(rules, []);
  });

  test("aucune règle du bon ni de la carte d'attente ne nomme un écran du rail", () => {
    for (const sheet of ["components/slip/slip.css", "components/card-wait/card-wait.css"]) {
      assert.deepEqual([...read(sheet).matchAll(/([^{}]+)\{/g)].map(([, head = ""]) => head.trim()).filter((head) => /#rail|\.colonne|#fiche/.test(head)), [], sheet);
    }
  });

  test("la page charge le bon, puis la carte d'attente, avant la peau", () => {
    const page = readFileSync(join(VUE, "index.html"), "utf8");
    const [slipCss, cardCss, skin] = ['href="components/slip/slip.css"', 'href="components/card-wait/card-wait.css"', 'href="vue.css"'].map((href) => page.indexOf(href)) as [number, number, number];
    assert.ok(slipCss > 0 && slipCss < cardCss && cardCss < skin);
  });
});
