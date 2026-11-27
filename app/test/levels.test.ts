// Chaque réglage que l'app montre dit à quel niveau il vit (ticket 1310, épique 1301) : « project », « this computer »
// ou « you ». Une seule table (vue/levels.js) le dit ; un réglage montré sans niveau dans cette table fait échouer ce
// test, et la vue ne le rend pas.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { LEVELS, LEVELS_SAID, levelOf } from "../src/vue/levels.js";
import { Fake } from "./helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) };
const VUE = join(import.meta.dirname, "../src/vue");

// Tout ce que la vue demande à la table : `niveauDe(doc, "cle")` `avecNiveau(élément, "cle")` ou `contexte.niveau("cle")` (une section de la page d'une station), dans chaque module de la vue.
function requests(): Map<string, string[]> {
  const rendered = new Map<string, string[]>();
  const read = (folder: string) => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const path = join(folder, entry.name);
      if (entry.isDirectory()) read(path);
      else if (entry.name.endsWith(".js") && entry.name !== "levels.js") {
        for (const [, keyOf, keySection] of readFileSync(path, "utf8").matchAll(/(?:levelOf\([^,()]+|avecNiveau\(\w+\([^()]*\)),\s*"([^"]+)"\)|context\.niveau\("([^"]+)"\)/g)) { const key = keyOf ?? keySection ?? ""; rendered.set(key, [...(rendered.get(key) ?? []), entry.name]); }
      }
    }
  };
  read(VUE);
  return rendered;
}

describe("le niveau de chaque réglage montré", () => {
  test("les trois niveaux, dits par trois étiquettes", () => {
    assert.deepEqual(Object.values(LEVELS_SAID).map(({ libelle: wording }) => wording), ["project", "this computer", "you"]);
  });

  test("dépôt et branche sont du projet ; cooks, dossier et capacités de la machine ; couleurs et sigle de toi", () => {
    for (const key of ["depot", "branche"]) assert.equal(LEVELS[key], "project", key);
    for (const key of ["cooks", "dossier", "capacites", "ordinaires"]) assert.equal(LEVELS[key], "machine", key);
    for (const key of ["couleurs", "sigle"]) assert.equal(LEVELS[key], "you", key);
    // L'état de la cuisine dans la barre des menus (#3269) : une préférence d'affichage du chef.
    assert.equal(LEVELS["barre-de-menus"], "you");
  });

  test("un réglage que la table ne connaît pas ne se rend pas", () => {
    assert.throws(() => levelOf(doc, "inconnu"), /no level/);
  });

  test("chaque niveau demandé par la vue est dans la table, et chaque ligne de la table est montrée", () => {
    const views = requests();
    for (const [key, or] of views) assert.ok(LEVELS[key], `"${key}" est montré (${or.join(", ")}) sans niveau dans la table`);
    for (const key of Object.keys(LEVELS)) assert.ok(views.has(key), `"${key}" est dans la table mais n'est montré nulle part`);
  });
});
