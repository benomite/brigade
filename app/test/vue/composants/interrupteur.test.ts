// L'interrupteur de l'app (vue/composants/interrupteur, ticket 2914) : un seul pour tout marche / arrêt de chaque écran. Allumé,
// éteint, ou pas lu (alors il ne bascule rien) ; un clic appelle `changer` avec l'état voulu. Sa peau est dans sa feuille à
// elle, et aucun écran n'en écrit un à la main.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, test } from "node:test";
import { interrupteur } from "../../../src/vue/composants/interrupteur/interrupteur.js";
import { Faux } from "../../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const VUE = join(import.meta.dirname, "../../../src/vue");
const fichiers = (dossier: string): string[] => readdirSync(dossier).flatMap((nom) => (statSync(join(dossier, nom)).isDirectory() ? fichiers(join(dossier, nom)) : [join(dossier, nom)]));

describe("l'interrupteur", () => {
  test("allumé ou éteint, un clic demande l'état contraire", () => {
    const voulus: boolean[] = [];
    const allume = interrupteur(doc, { texte: "on", allume: true, libelle: "pc takes the ordinary tickets" }, (voulu) => void voulus.push(voulu));
    assert.equal(allume.role, "switch");
    assert.equal(allume.className, "bascule");
    assert.equal(allume.dataset.etat, "allume");
    assert.equal(allume.ariaChecked, "true");
    assert.equal(allume.ariaLabel, "pc takes the ordinary tickets");
    assert.deepEqual(allume.children.map(({ className }: Faux) => className), ["glissiere", ""]);
    allume.click();
    const eteint = interrupteur(doc, { texte: "off", allume: false, libelle: "x" }, (voulu) => void voulus.push(voulu));
    assert.equal(eteint.dataset.etat, "eteint");
    eteint.click();
    assert.deepEqual(voulus, [false, true]);
  });

  test("pas lu, ou en attente : il ne bascule rien", () => {
    const voulus: boolean[] = [];
    const inconnu = interrupteur(doc, { texte: "…", allume: undefined, libelle: "x" }, (voulu) => void voulus.push(voulu));
    assert.equal(inconnu.dataset.etat, "inconnu");
    assert.equal(inconnu.ariaChecked, "mixed");
    assert.equal(inconnu.disabled, true);
    const attend = interrupteur(doc, { texte: "on", allume: true, libelle: "x", actif: false, titre: "a change is on its way" }, (voulu) => void voulus.push(voulu));
    assert.equal(attend.disabled, true);
    assert.equal(attend.title, "a change is on its way");
    inconnu.click();
    attend.click();
    attend.declencher("click");
    assert.deepEqual(voulus, []);
  });

  test("sa feuille ne nomme aucun écran, et aucun écran ne pose sa propre glissière", () => {
    const feuille = readFileSync(join(VUE, "composants/interrupteur/interrupteur.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    assert.doesNotMatch(feuille, /#[a-z]/);
    const peintes = fichiers(VUE)
      .filter((fichier) => fichier.endsWith(".js") && !fichier.endsWith(join("composants", "interrupteur", "interrupteur.js")))
      .filter((fichier) => /className = ["`](bascule|glissiere)["`]/.test(readFileSync(fichier, "utf8")))
      .map((fichier) => relative(VUE, fichier));
    assert.deepEqual(peintes, []);
    const css = fichiers(VUE)
      .filter((fichier) => fichier.endsWith(".css") && !fichier.endsWith(join("composants", "interrupteur", "interrupteur.css")))
      .filter((fichier) => /\.bascule|\.glissiere/.test(readFileSync(fichier, "utf8").replace(/\/\*[\s\S]*?\*\//g, "")))
      .map((fichier) => relative(VUE, fichier));
    assert.deepEqual(css, []);
  });
});
