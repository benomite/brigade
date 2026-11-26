// L'interrupteur de l'app (vue/composants/switch, ticket 2914) : un seul pour tout marche / arrêt de chaque écran. Allumé,
// éteint, ou pas lu (alors il ne bascule rien) ; un clic appelle `changer` avec l'état voulu. Sa peau est dans sa feuille à
// elle, et aucun écran n'en écrit un à la main.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, test } from "node:test";
import { toggle } from "../../../src/vue/composants/switch/switch.js";
import { Faux } from "../../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const VUE = join(import.meta.dirname, "../../../src/vue");
const fichiers = (dossier: string): string[] => readdirSync(dossier).flatMap((name) => (statSync(join(dossier, name)).isDirectory() ? fichiers(join(dossier, name)) : [join(dossier, name)]));

describe("l'interrupteur", () => {
  test("allumé ou éteint, un clic demande l'état contraire", () => {
    const voulus: boolean[] = [];
    const allume = toggle(doc, { texte: "on", allume: true, libelle: "pc takes the ordinary tickets" }, (voulu) => void voulus.push(voulu));
    assert.equal(allume.role, "switch");
    assert.equal(allume.className, "bascule");
    assert.equal(allume.dataset.etat, "allume");
    assert.equal(allume.ariaChecked, "true");
    assert.equal(allume.ariaLabel, "pc takes the ordinary tickets");
    assert.deepEqual(allume.children.map(({ className }: Faux) => className), ["glissiere", ""]);
    allume.click();
    const eteint = toggle(doc, { texte: "off", allume: false, libelle: "x" }, (voulu) => void voulus.push(voulu));
    assert.equal(eteint.dataset.etat, "eteint");
    eteint.click();
    assert.deepEqual(voulus, [false, true]);
  });

  test("pas lu, ou en attente : il ne bascule rien", () => {
    const voulus: boolean[] = [];
    const inconnu = toggle(doc, { texte: "…", allume: undefined, libelle: "x" }, (voulu) => void voulus.push(voulu));
    assert.equal(inconnu.dataset.etat, "inconnu");
    assert.equal(inconnu.ariaChecked, "mixed");
    assert.equal(inconnu.disabled, true);
    const awaiting = toggle(doc, { texte: "on", allume: true, libelle: "x", actif: false, titre: "a change is on its way" }, (voulu) => void voulus.push(voulu));
    assert.equal(awaiting.disabled, true);
    assert.equal(awaiting.title, "a change is on its way");
    inconnu.click();
    awaiting.click();
    awaiting.declencher("click");
    assert.deepEqual(voulus, []);
  });

  test("sa feuille ne nomme aucun écran, et aucun écran ne pose sa propre glissière", () => {
    const feuille = readFileSync(join(VUE, "composants/switch/switch.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    assert.doesNotMatch(feuille, /#[a-z]/);
    const peintes = fichiers(VUE)
      .filter((fichier) => fichier.endsWith(".js") && !fichier.endsWith(join("composants", "switch", "switch.js")))
      .filter((fichier) => /className = ["`](bascule|glissiere)["`]/.test(readFileSync(fichier, "utf8")))
      .map((fichier) => relative(VUE, fichier));
    assert.deepEqual(peintes, []);
    const css = fichiers(VUE)
      .filter((fichier) => fichier.endsWith(".css") && !fichier.endsWith(join("composants", "switch", "switch.css")))
      .filter((fichier) => /\.bascule|\.glissiere/.test(readFileSync(fichier, "utf8").replace(/\/\*[\s\S]*?\*\//g, "")))
      .map((fichier) => relative(VUE, fichier));
    assert.deepEqual(css, []);
  });
});
