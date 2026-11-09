// Settings ne tient que des réglages du projet (#2494) : le bloc « This computer » n'y est plus, et chaque réglage montré a
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
const STATION = "the station that serves the project";
const FICHIER_DES_PROJETS = "the app's projects file";
// Les blocs que la page pose dans Settings, lus dans index.html — pas une liste à part — : chaque `id` d'un bloc de réglage.
const BLOCS = [...settings.matchAll(/<div id="([\w-]+)"/g)].map((trouve) => trouve[1] as string);
// Où chaque bloc garde ce qu'il règle. Un bloc posé dans Settings sans ligne ici fait échouer le test, et une ligne sans
// bloc aussi. `reglages-du-projet` porte une ligne par clé de `setting` (CLES) : toutes dans projet.json.
const STOCKAGE: Record<string, string> = {
  "reglages-du-projet": PROJET_JSON,
  // Les rangées que l'artboard ne dessine pas (closer) : les mêmes clés de `setting`, dans un bloc sous la couleur.
  "reglages-du-projet-en-plus": PROJET_JSON,
  // Les humains du projet (#2930) : la clé `humans`, changée par une PR.
  "humains-du-projet": PROJET_JSON,
  "arreter-cuisine": STATION,
  sigle: FICHIER_DES_PROJETS,
  couleurs: FICHIER_DES_PROJETS,
  retrait: FICHIER_DES_PROJETS,
  // Les stations contributrices que le chef refuse (#2936) : une liste que garde la station, dans son répertoire d'état.
  "stations-contributrices": STATION,
  // Les plafonds et le closer (#3014) : `drift.*` et `closer.*` de projet.json, et les vérifications en plus du closer dans
  // closer-checks.md, chacun changé par une PR ; les lignes de tous les projets n'ouvrent que leurs pages.
  "bandeau-sante": `${PROJET_JSON} and .claude/brigade/closer-checks.md`,
};

describe("Settings : les réglages du projet seulement", () => {
  test("le bloc « This computer » n'est plus dans Settings : ni titre, ni ses lignes", () => {
    assert.ok(holder > entier.indexOf("</section>"), "ce qui attend Stations est posé hors de Settings, caché");
    assert.doesNotMatch(settings, /This computer|reglages-machine|niveau-machine|ordinaires|apps-github|projets-servis/i);
    assert.doesNotMatch(settings, /id="reglages-toi"|niveau-you/);
  });

  test("le sigle, les couleurs et le retrait restent dans Settings ; le retrait se lit « Remove this project from the app's sidebar »", () => {
    for (const id of ["sigle", "couleurs", "retrait"]) assert.match(settings, new RegExp(`id="${id}"`), id);
    assert.match(settings, /aria-label="Remove this project from the app's sidebar"/);
    const vue = readFileSync(join(VUE, "vue.js"), "utf8");
    assert.match(vue, /rangeeDeReglage\("Remove this project from the app's sidebar"/);
    assert.doesNotMatch(vue, /rangeeDeReglage\("in your app"/);
  });

  test("chaque réglage montré a son stockage, dit par une table qui suit la page ; ceux que `setting` lit sont dans projet.json", () => {
    assert.deepEqual([...BLOCS].sort(), Object.keys(STOCKAGE).sort(), "la table suit les blocs posés dans Settings");
    for (const cle of CLES) assert.equal(STOCKAGE["reglages-du-projet"], PROJET_JSON, cle);
    // Rien de ce qui est à la machine ne reste listé.
    for (const id of BLOCS) assert.notEqual((NIVEAUX as Record<string, string>)[id as string], "machine", id);
  });

  // Le critère « tout est dans projet.json » ne tient pas encore : le sigle, les couleurs et le retrait sont gardés par
  // l'app, la cuisine par la station. Ce test les nomme pour que le jour où ils rejoignent projet.json,
  // cette liste se vide — et que tout autre bloc hors de projet.json soit vu.
  test("les blocs qui ne sont pas encore dans projet.json sont ceux-là, et eux seuls", () => {
    const dehors = BLOCS.filter((id) => STOCKAGE[id] !== PROJET_JSON).sort();
    assert.deepEqual(dehors, ["arreter-cuisine", "bandeau-sante", "couleurs", "retrait", "sigle", "stations-contributrices"]);
  });
});
