// Settings ne tient que des réglages du projet (#2494) : le bloc « This computer » n'y est plus, et chaque réglage montré a
// son stockage dit par une table — ceux que `setting` lit sont dans `.claude/brigade/projet.json`. Le test lit la page
// telle qu'elle est posée (index.html) : un réglage de plus, ou un bloc rendu, fait échouer la liste.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { KEYS } from "../../../src/settings-of-project.ts";
import { LEVELS } from "../../../src/vue/levels.js";

const VUE = join(import.meta.dirname, "../../../src/vue");
const html = readFileSync(join(VUE, "index.html"), "utf8");
const start = html.indexOf('<section id="etat"');
const end = html.indexOf('<p id="lu-onglet"');
const whole = html.slice(start, end).replace(/<!--[\s\S]*?-->/g, "");
// Le conteneur caché de ce qui était à la machine est posé après Settings, hors de lui.
const holder = whole.indexOf('<div id="reglages-machine"');
const settings = whole.slice(0, holder === -1 ? undefined : holder);

const PROJECT_JSON = ".claude/brigade/projet.json";
const STATION = "the station that serves the project";
const FILE_OF_PROJECTS = "the app's projects file";
// Les blocs que la page pose dans Settings, lus dans index.html — pas une liste à part — : chaque `id` d'un bloc de réglage.
const BLOCKS = [...settings.matchAll(/<div id="([\w-]+)"/g)].map((finds) => finds[1] as string);
// Où chaque bloc garde ce qu'il règle. Un bloc posé dans Settings sans ligne ici fait échouer le test, et une ligne sans
// bloc aussi. `reglages-du-projet` porte une ligne par clé de `setting` (CLES) : toutes dans projet.json.
const STORAGE: Record<string, string> = {
  "reglages-du-projet": PROJECT_JSON,
  // Les rangées que l'artboard ne dessine pas (closer) : les mêmes clés de `setting`, dans un bloc sous la couleur.
  "reglages-du-projet-en-plus": PROJECT_JSON,
  // Les humains du projet (#2930) : la clé `humans`, changée par une PR.
  "humains-du-projet": PROJECT_JSON,
  sigle: FILE_OF_PROJECTS,
  couleurs: FILE_OF_PROJECTS,
  retrait: FILE_OF_PROJECTS,
  // L'état de la cuisine dans la barre des menus (#3269) : `barreDeMenus`, une préférence du chef pour toute l'app.
  "barre-de-menus": FILE_OF_PROJECTS,
  // Les stations contributrices que le chef refuse (#2936) : une liste que garde la station, dans son répertoire d'état.
  "stations-contributrices": STATION,
  // La fiche du projet (#4240) : `.brigade/fiche-projet.json`, dans le dossier du projet sur ce poste.
  "fiche-du-projet": ".brigade/fiche-projet.json, in the project's folder",
  // Les plafonds et le closer (#3014) : `drift.*` et `closer.*` de projet.json, et les vérifications en plus du closer dans
  // closer-checks.md, chacun changé par une PR ; les lignes de tous les projets n'ouvrent que leurs pages.
  "bandeau-sante": `${PROJECT_JSON} and .claude/brigade/closer-checks.md`,
};

describe("Settings : les réglages du projet seulement", () => {
  test("le bloc « This computer » n'est plus dans Settings : ni titre, ni ses lignes", () => {
    assert.ok(holder > whole.indexOf("</section>"), "ce qui attend Stations est posé hors de Settings, caché");
    assert.doesNotMatch(settings, /This computer|reglages-machine|niveau-machine|ordinaires|apps-github|projets-servis/i);
    assert.doesNotMatch(settings, /id="reglages-toi"|niveau-you/);
  });

  test("le sigle, les couleurs et le retrait restent dans Settings ; le retrait se lit « Remove this project from the app's sidebar »", () => {
    for (const id of ["sigle", "couleurs", "retrait"]) assert.match(settings, new RegExp(`id="${id}"`), id);
    assert.match(settings, /aria-label="Remove this project from the app's sidebar"/);
    const vue = readFileSync(join(VUE, "vue.js"), "utf8");
    assert.match(vue, /rowOfSetting\("Remove this project from the app's sidebar"/);
    assert.doesNotMatch(vue, /rangeeDeReglage\("in your app"/);
  });

  test("chaque réglage montré a son stockage, dit par une table qui suit la page ; ceux que `setting` lit sont dans projet.json", () => {
    assert.deepEqual([...BLOCKS].sort(), Object.keys(STORAGE).sort(), "la table suit les blocs posés dans Settings");
    for (const key of KEYS) assert.equal(STORAGE["reglages-du-projet"], PROJECT_JSON, key);
    // Rien de ce qui est à la machine ne reste listé.
    for (const id of BLOCKS) assert.notEqual((LEVELS as Record<string, string>)[id as string], "machine", id);
  });

  // Le critère « tout est dans projet.json » ne tient pas encore : le sigle, les couleurs et le retrait sont gardés par
  // l'app, la cuisine par la station. Ce test les nomme pour que le jour où ils rejoignent projet.json,
  // cette liste se vide — et que tout autre bloc hors de projet.json soit vu.
  test("les blocs qui ne sont pas encore dans projet.json sont ceux-là, et eux seuls", () => {
    const outside = BLOCKS.filter((id) => STORAGE[id] !== PROJECT_JSON).sort();
    assert.deepEqual(outside, ["bandeau-sante", "barre-de-menus", "couleurs", "fiche-du-projet", "retrait", "sigle", "stations-contributrices"]);
  });
});
