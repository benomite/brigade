// Chaque réglage que l'app montre dit à quel niveau il vit (ticket 1310, épique 1301) : « project », « this machine »
// ou « you ». Une seule table (vue/niveaux.js) le dit ; un réglage montré sans niveau dans cette table fait échouer ce
// test, et la vue ne le rend pas.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { CLES, reglagesVus } from "../src/reglages-du-projet.ts";
import { NIVEAUX, NIVEAUX_DITS, niveauDe } from "../src/vue/niveaux.js";
import { poserUnReglage } from "../src/vue/projet/reglages.js";
import { Faux } from "./aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const VUE = join(import.meta.dirname, "../src/vue");

// Tout ce que la vue demande à la table : `niveauDe(doc, "cle")` ou `avecNiveau(élément, "cle")`, dans chaque module de la vue.
function demandes(): Map<string, string[]> {
  const rendu = new Map<string, string[]>();
  const lire = (dossier: string) => {
    for (const entree of readdirSync(dossier, { withFileTypes: true })) {
      const chemin = join(dossier, entree.name);
      if (entree.isDirectory()) lire(chemin);
      else if (entree.name.endsWith(".js") && entree.name !== "niveaux.js") {
        for (const [, cle] of readFileSync(chemin, "utf8").matchAll(/(?:niveauDe\([^,()]+|avecNiveau\(\w+\([^()]*\)),\s*"([^"]+)"\)/g)) rendu.set(cle ?? "", [...(rendu.get(cle ?? "") ?? []), entree.name]);
      }
    }
  };
  lire(VUE);
  return rendu;
}

describe("le niveau de chaque réglage montré", () => {
  test("les trois niveaux, dits par trois étiquettes", () => {
    assert.deepEqual(Object.values(NIVEAUX_DITS).map(({ libelle }) => libelle), ["project", "this machine", "you"]);
  });

  test("branche, calibrages et plafond sont du projet ; cooks, dossier et capacités de la machine ; couleurs de toi", () => {
    for (const cle of ["depot", "branche", "manager", "reviewer", "plafond", "calibrage"]) assert.equal(NIVEAUX[cle], "project", cle);
    for (const cle of ["cooks", "dossier", "capacites", "ordinaires"]) assert.equal(NIVEAUX[cle], "machine", cle);
    for (const cle of ["couleurs"]) assert.equal(NIVEAUX[cle], "you", cle);
  });

  test("un réglage que la table ne connaît pas ne se rend pas", () => {
    assert.throws(() => niveauDe(doc, "inconnu"), /no level/);
  });

  test("chaque réglage du projet lu par `setting` porte son étiquette sur sa page", () => {
    const vus = reglagesVus(
      JSON.stringify({
        file: ".claude/brigade/projet.json",
        inRepository: true,
        integrationBranch: { value: "main", from: "repository" },
        defaultCalibrations: { manager: { model: "opus", effort: "high", from: "repository" }, reviewer: null },
        calibrationCeiling: { model: "opus", effort: "high", from: "default" },
      }),
    );
    assert.ok(vus);
    assert.deepEqual(vus.reglages.map(({ cle }) => cle), [...CLES]);
    for (const vu of vus.reglages) {
      const rangee = poserUnReglage(doc, { vu, modeles: vus.modeles, efforts: vus.efforts, etat: undefined, choisir: () => {}, proposer: () => {}, ouvrir: () => {} }) as Faux;
      const etiquettes = [...rangee.descendants()].filter(({ className }) => className === "niveau");
      assert.deepEqual(etiquettes.map(({ textContent }) => textContent), [NIVEAUX_DITS[NIVEAUX[vu.cle] ?? "you"].libelle], vu.cle);
    }
  });

  test("chaque niveau demandé par la vue est dans la table, et chaque ligne de la table est montrée", () => {
    const vues = demandes();
    for (const [cle, ou] of vues) assert.ok(NIVEAUX[cle], `"${cle}" est montré (${ou.join(", ")}) sans niveau dans la table`);
    // Les réglages du projet se posent par leur clé : le test d'au-dessus les rend.
    const ailleurs: string[] = [...CLES];
    for (const cle of Object.keys(NIVEAUX).filter((cle) => !ailleurs.includes(cle))) assert.ok(vues.has(cle), `"${cle}" est dans la table mais n'est montré nulle part`);
  });
});
