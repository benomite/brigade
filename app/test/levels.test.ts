// Chaque réglage que l'app montre dit à quel niveau il vit (ticket 1310, épique 1301) : « project », « this computer »
// ou « you ». Une seule table (vue/levels.js) le dit ; un réglage montré sans niveau dans cette table fait échouer ce
// test, et la vue ne le rend pas.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { KEYS, settingsSeen } from "../src/settings-of-project.ts";
import { LEVELS, LEVELS_SAID, levelOf } from "../src/vue/levels.js";
import { setOneSetting } from "../src/vue/project/settings.js";
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

  test("branche, calibrages, plafond et closer sont du projet ; cooks, dossier et capacités de la machine ; couleurs et sigle de toi", () => {
    for (const key of ["depot", "branche", "manager", "reviewer", "plafond", "closer", "closer-cooks", "closer-tokens", "closer-lines"]) assert.equal(LEVELS[key], "project", key);
    for (const key of ["cooks", "dossier", "capacites", "ordinaires"]) assert.equal(LEVELS[key], "machine", key);
    for (const key of ["couleurs", "sigle"]) assert.equal(LEVELS[key], "you", key);
    // L'état de la cuisine dans la barre des menus (#3269) : une préférence d'affichage du chef.
    assert.equal(LEVELS["barre-de-menus"], "you");
  });

  test("un réglage que la table ne connaît pas ne se rend pas", () => {
    assert.throws(() => levelOf(doc, "inconnu"), /no level/);
  });

  test("chaque réglage du projet lu par `setting` porte son étiquette sur sa page", () => {
    const seenOnes = settingsSeen(
      JSON.stringify({
        file: ".claude/brigade/projet.json",
        inRepository: true,
        integrationBranch: { value: "main", from: "repository" },
        defaultCalibrations: { manager: { model: "opus", effort: "high", from: "repository" }, reviewer: null },
        calibrationCeiling: { model: "opus", effort: "high", from: "default" },
        closer: { calibration: null, cooksBelow: { value: 1, from: "default" }, maxTokens: { value: 500000, from: "default" }, maxRemovedLines: { value: 500, from: "repository" } },
      }),
    );
    assert.ok(seenOnes);
    assert.deepEqual(seenOnes.reglages.map(({ cle: key }) => key), [...KEYS]);
    for (const seenOne of seenOnes.reglages) {
      const row = setOneSetting(doc, { vu: seenOne, modeles: seenOnes.modeles, efforts: seenOnes.efforts, etat: undefined, choisir: () => {}, proposer: () => {}, ouvrir: () => {} }) as Fake;
      const labels = [...row.descendants()].filter(({ className }) => className === "niveau");
      assert.deepEqual(labels.map(({ textContent }) => textContent), [LEVELS_SAID[LEVELS[seenOne.cle] ?? "you"].libelle], seenOne.cle);
    }
  });

  test("chaque niveau demandé par la vue est dans la table, et chaque ligne de la table est montrée", () => {
    const views = requests();
    for (const [key, or] of views) assert.ok(LEVELS[key], `"${key}" est montré (${or.join(", ")}) sans niveau dans la table`);
    // Les réglages du projet se posent par leur clé : le test d'au-dessus les rend.
    const elsewhere: string[] = [...KEYS];
    for (const key of Object.keys(LEVELS).filter((key) => !elsewhere.includes(key))) assert.ok(views.has(key), `"${key}" est dans la table mais n'est montré nulle part`);
  });
});
