// Settings ne tient que des réglages du projet (#2494) : le bloc « This machine » n'y est plus, et chaque réglage montré a
// son stockage dit par une table — ceux que `setting` lit sont dans `.claude/brigade/projet.json`. Le test lit la page
// telle qu'elle est posée (index.html) : un réglage de plus, ou un bloc rendu, fait échouer la liste.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { CLES } from "../../../src/reglages-du-projet.ts";
import { NIVEAUX } from "../../../src/vue/niveaux.js";

const VUE = join(import.meta.dirname, "../../../src/vue");
const html = readFileSync(join(VUE, "index.html"), "utf8");
const debut = html.indexOf('<section id="etat"');
const fin = html.indexOf('<p id="lu-onglet"');
const entier = html.slice(debut, fin).replace(/<!--[\s\S]*?-->/g, "");
// Le conteneur caché de ce qui était à la machine est posé après Settings, hors de lui.
const holder = entier.indexOf('<div id="reglages-machine"');
const settings = entier.slice(0, holder === -1 ? undefined : holder);

const PROJET_JSON = ".claude/brigade/projet.json";
// Les réglages que la page montre dans Settings, et où chacun est gardé. Les réglages lus par `setting` sont ceux de
// CLES ; les autres lignes sont celles que le projet porte en plus.
const MONTRES: Record<string, string> = {
  ...Object.fromEntries(CLES.map((cle) => [cle, PROJET_JSON])),
  grants: "the station that serves the project (grants)",
  kitchen: "the station that serves the project (service)",
  sigle: "the app's projects file",
  couleurs: "the app's projects file",
  retrait: "the app's projects file",
};

describe("Settings : les réglages du projet seulement", () => {
  test("le bloc « This machine » n'est plus dans Settings : ni titre, ni ses lignes", () => {
    assert.ok(holder > entier.indexOf("</section>"), "ce qui attend Stations est posé hors de Settings, caché");
    assert.doesNotMatch(settings, /This machine|reglages-machine|niveau-machine|ordinaires|apps-github|projets-servis/i);
    assert.doesNotMatch(settings, /id="reglages-toi"|niveau-you/);
  });

  test("le sigle, les couleurs et le retrait restent dans Settings ; le retrait se lit « Remove this project from the app's sidebar »", () => {
    for (const id of ["sigle", "couleurs", "retrait"]) assert.match(settings, new RegExp(`id="${id}"`), id);
    assert.match(settings, /aria-label="Remove this project from the app's sidebar"/);
    const vue = readFileSync(join(VUE, "vue.js"), "utf8");
    assert.match(vue, /rangeeDeReglage\("Remove this project from the app's sidebar"/);
    assert.doesNotMatch(vue, /rangeeDeReglage\("in your app"/);
  });

  test("chaque réglage montré a un stockage ; ceux que `setting` lit sont dans .claude/brigade/projet.json", () => {
    for (const cle of CLES) assert.equal(MONTRES[cle], PROJET_JSON, cle);
    for (const cle of Object.keys(NIVEAUX).filter((cle) => cle in MONTRES)) assert.ok(MONTRES[cle], cle);
    // Rien de ce qui est à la machine ne reste listé.
    for (const cle of Object.keys(MONTRES)) assert.notEqual(NIVEAUX[cle], "machine", cle);
  });
});
