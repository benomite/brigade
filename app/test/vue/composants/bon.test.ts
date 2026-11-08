// Le bon de l'app (vue/composants/bon, ticket 2918) : un seul bon pour tous les écrans, bâti sur la pastille ; sa peau est
// dans sa feuille, et vue.css ne dessine plus aucun bon.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { bon, teteDuBon } from "../../../src/vue/composants/bon/bon.js";
import { Faux } from "../../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const VUE = join(import.meta.dirname, "../../../src/vue");
const lire = (fichier: string) => readFileSync(join(VUE, fichier), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

describe("le bon", () => {
  test("un `li.bon` dont la tête porte le numéro, puis la pastille de l'état dans le mot de la file", () => {
    const numero = new Faux("span");
    const pose = bon(doc, { numero, mot: "in pass", etat: "pass" }) as unknown as Faux;
    assert.equal(pose.className, "bon");
    assert.equal(pose.dataset.hors, undefined);
    const tete = teteDuBon(pose) as Faux;
    assert.equal(tete.children[0], numero);
    assert.equal((tete.children[1] as Faux).dataset.pastille, "pass");
    assert.equal(((tete.children[1] as Faux).children[1] as Faux).textContent, "in pass");
  });

  test("sans mot d'état, la tête ne porte que le numéro ; hors colonne, le bon le dit", () => {
    const pose = bon(doc, { numero: new Faux("span"), hors: true }) as unknown as Faux;
    assert.equal(teteDuBon(pose).children.length, 1);
    assert.equal(pose.dataset.hors, "");
  });
});

describe("la feuille du bon", () => {
  test("vue.css ne dessine aucun bon, ni aucune carte d'attente", () => {
    const regles = [...lire("vue.css").matchAll(/([^{}]+)\{/g)].map(([, tete = ""]) => tete.trim()).filter((tete) => /\.bon\b|carte-todo|data-attend|envoi-en-attente/.test(tete));
    assert.deepEqual(regles, []);
  });

  test("aucune règle du bon ni de la carte d'attente ne nomme un écran du rail", () => {
    for (const feuille of ["composants/bon/bon.css", "composants/carte-attente/carte-attente.css"]) {
      assert.deepEqual([...lire(feuille).matchAll(/([^{}]+)\{/g)].map(([, tete = ""]) => tete.trim()).filter((tete) => /#rail|\.colonne|#fiche/.test(tete)), [], feuille);
    }
  });

  test("la page charge le bon, puis la carte d'attente, avant la peau", () => {
    const page = readFileSync(join(VUE, "index.html"), "utf8");
    const [bonCss, carteCss, peau] = ['href="composants/bon/bon.css"', 'href="composants/carte-attente/carte-attente.css"', 'href="vue.css"'].map((href) => page.indexOf(href)) as [number, number, number];
    assert.ok(bonCss > 0 && bonCss < carteCss && carteCss < peau);
  });
});
