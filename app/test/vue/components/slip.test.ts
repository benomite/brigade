// Le bon de l'app (vue/components/slip, ticket 2918) : un seul bon pour tous les écrans, bâti sur la pastille ; sa peau est
// dans sa feuille, et vue.css ne dessine plus aucun bon.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { slip, headOfSlip } from "../../../src/vue/components/slip/slip.js";
import { Fake } from "../../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) };
const VUE = join(import.meta.dirname, "../../../src/vue");
const read = (file: string) => readFileSync(join(VUE, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

describe("le bon", () => {
  test("un `li.bon` dont la tête porte le numéro, puis la pastille de l'état dans le mot de la file", () => {
    const number = new Fake("span");
    const pose = slip(doc, { numero: number, mot: "in pass", etat: "pass" }) as unknown as Fake;
    assert.equal(pose.className, "bon");
    assert.equal(pose.dataset.hors, undefined);
    const head = headOfSlip(pose) as Fake;
    assert.equal(head.children[0], number);
    assert.equal((head.children[1] as Fake).dataset.pastille, "pass");
    assert.equal(((head.children[1] as Fake).children[1] as Fake).textContent, "in pass");
  });

  test("sans mot d'état, la tête ne porte que le numéro ; hors colonne, le bon le dit", () => {
    const pose = slip(doc, { numero: new Fake("span"), hors: true }) as unknown as Fake;
    assert.equal(headOfSlip(pose).children.length, 1);
    assert.equal(pose.dataset.hors, "");
  });
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
