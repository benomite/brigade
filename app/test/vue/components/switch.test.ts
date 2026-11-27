// L'interrupteur de l'app (vue/components/switch, ticket 2914) : un seul pour tout marche / arrêt de chaque écran. Allumé,
// éteint, ou pas lu (alors il ne bascule rien) ; un clic appelle `changer` avec l'état voulu. Sa peau est dans sa feuille à
// elle, et aucun écran n'en écrit un à la main.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, test } from "node:test";
import { toggleSwitch } from "../../../src/vue/components/switch/switch.js";
import { Fake } from "../../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) };
const VUE = join(import.meta.dirname, "../../../src/vue");
const files = (folder: string): string[] => readdirSync(folder).flatMap((name) => (statSync(join(folder, name)).isDirectory() ? files(join(folder, name)) : [join(folder, name)]));

describe("l'interrupteur", () => {
  test("allumé ou éteint, un clic demande l'état contraire", () => {
    const wantedOnes: boolean[] = [];
    const lit = toggleSwitch(doc, { texte: "on", allume: true, libelle: "pc takes the ordinary tickets" }, (wanted) => void wantedOnes.push(wanted));
    assert.equal(lit.role, "switch");
    assert.equal(lit.className, "bascule");
    assert.equal(lit.dataset.etat, "allume");
    assert.equal(lit.ariaChecked, "true");
    assert.equal(lit.ariaLabel, "pc takes the ordinary tickets");
    assert.deepEqual(lit.children.map(({ className }: Fake) => className), ["glissiere", ""]);
    lit.click();
    const off = toggleSwitch(doc, { texte: "off", allume: false, libelle: "x" }, (wanted) => void wantedOnes.push(wanted));
    assert.equal(off.dataset.etat, "eteint");
    off.click();
    assert.deepEqual(wantedOnes, [false, true]);
  });

  test("pas lu, ou en attente : il ne bascule rien", () => {
    const wantedOnes: boolean[] = [];
    const unknown = toggleSwitch(doc, { texte: "…", allume: undefined, libelle: "x" }, (wanted) => void wantedOnes.push(wanted));
    assert.equal(unknown.dataset.etat, "inconnu");
    assert.equal(unknown.ariaChecked, "mixed");
    assert.equal(unknown.disabled, true);
    const awaiting = toggleSwitch(doc, { texte: "on", allume: true, libelle: "x", actif: false, titre: "a change is on its way" }, (wanted) => void wantedOnes.push(wanted));
    assert.equal(awaiting.disabled, true);
    assert.equal(awaiting.title, "a change is on its way");
    unknown.click();
    awaiting.click();
    awaiting.declencher("click");
    assert.deepEqual(wantedOnes, []);
  });

  test("sa feuille ne nomme aucun écran, et aucun écran ne pose sa propre glissière", () => {
    const sheet = readFileSync(join(VUE, "components/switch/switch.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    assert.doesNotMatch(sheet, /#[a-z]/);
    const painted = files(VUE)
      .filter((file) => file.endsWith(".js") && !file.endsWith(join("components", "switch", "switch.js")))
      .filter((file) => /className = ["`](bascule|glissiere)["`]/.test(readFileSync(file, "utf8")))
      .map((file) => relative(VUE, file));
    assert.deepEqual(painted, []);
    const css = files(VUE)
      .filter((file) => file.endsWith(".css") && !file.endsWith(join("components", "switch", "switch.css")))
      .filter((file) => /\.bascule|\.glissiere/.test(readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "")))
      .map((file) => relative(VUE, file));
    assert.deepEqual(css, []);
  });
});
