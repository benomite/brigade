// La rangée de réglage de l'app (vue/composants/setting, ticket 2920) : une seule pour chaque réglage de chaque écran — son
// nom et son niveau, sa valeur, son contrôle, qui s'applique dès qu'il change ; un réglage gardé dans le dépôt le dit en
// une ligne sur sa rangée ; dessous, ce que le dernier changement a rendu. Sa peau est dans sa feuille à elle : aucune
// règle de vue.css ne dessine une rangée de réglage, et aucun écran n'en écrit une à la main.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, test } from "node:test";
import { ditDuSetting, PAR_PR, PROPOSE, rangeeDeSetting } from "../../../src/vue/composants/setting/setting.js";
import { niveauDe } from "../../../src/vue/niveaux.js";
import { Faux } from "../../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const VUE = join(import.meta.dirname, "../../../src/vue");
const sansCommentaires = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const fichiers = (dossier: string): string[] => readdirSync(dossier).flatMap((name) => (statSync(join(dossier, name)).isDirectory() ? fichiers(join(dossier, name)) : [join(dossier, name)]));

describe("la rangée de réglage", () => {
  test("son nom et la marque de son niveau, sa valeur, son contrôle, puis ce qu'il a rendu", () => {
    const champ = new Faux("input");
    const refusal = new Faux("p");
    const rangee = rangeeDeSetting(doc, { nom: "cooks at once", cle: "cooks", niveau: niveauDe(doc, "cooks"), valeur: ["2"], controle: [champ], dessous: [refusal] });
    assert.equal(rangee.className, "reglage");
    assert.equal(rangee.dataset.cle, "cooks");
    assert.deepEqual(
      rangee.children.map((pose: Faux) => pose.className),
      ["nom", "valeur", "champ", ""],
    );
    assert.equal(rangee.children[0]?.textContent, "cooks at oncethis computer");
    assert.equal(rangee.children[2]?.children[0], champ);
    // Un réglage de la machine ne passe pas par le dépôt : aucune ligne de PR.
    assert.equal(rangee.dataset.depot, undefined);
    assert.ok(!rangee.textContent.includes(PAR_PR));
  });

  test("un réglage gardé dans le dépôt — son niveau « project », ou `depot` — dit sur sa rangée qu'un changement ouvre une PR", () => {
    for (const rangee of [
      rangeeDeSetting(doc, { nom: "calibration ceiling", niveau: niveauDe(doc, "plafond"), controle: [new Faux("select")] }),
      rangeeDeSetting(doc, { nom: "max cook duration", depot: true, controle: [new Faux("input")] }),
    ]) {
      assert.equal(rangee.dataset.depot, "");
      const line = rangee.children.find((pose: Faux) => pose.className === "par-pr");
      assert.equal(line?.textContent, PAR_PR);
      // La ligne suit le contrôle, avant ce que le changement a rendu.
      assert.equal(rangee.children.indexOf(line as Faux), 3);
    }
    // `depot: false` l'emporte sur le niveau.
    assert.equal(rangeeDeSetting(doc, { nom: "x", niveau: niveauDe(doc, "plafond"), depot: false }).dataset.depot, undefined);
  });

  test("ce que le dernier changement a rendu : rien, en route, fait, la PR ouverte et son bouton, ou le refus en une ligne", () => {
    assert.deepEqual(ditDuSetting(doc, undefined), []);
    assert.deepEqual(ditDuSetting(doc, { refus: "" }), []);
    const [enCours] = ditDuSetting(doc, { enCours: "proposing…" });
    assert.equal(enCours?.className, "dit en-cours");
    assert.equal(enCours?.textContent, "proposing…");
    const [fait] = ditDuSetting(doc, { fait: "applied" });
    assert.equal(fait?.className, "dit fait");
    const ouvertes: string[] = [];
    const [pr] = ditDuSetting(doc, { pr: "https://github.com/o/r/pull/51", numero: 51, valeur: "sonnet / high" }, { ouvrir: (url) => ouvertes.push(url) });
    assert.equal(pr?.className, "dit propose");
    assert.equal(pr?.children[0]?.textContent, `sonnet / high ${PROPOSE}`);
    const button = pr?.dessous("button")[0] ?? assert.fail("pas de bouton de la PR");
    assert.equal(button.textContent, "pull request #51");
    assert.equal(button.title, "https://github.com/o/r/pull/51");
    button.click();
    assert.deepEqual(ouvertes, ["https://github.com/o/r/pull/51"]);
    const [refusal] = ditDuSetting(doc, { refus: "nothing was proposed: GitHub refused", detail: "422" });
    assert.equal(refusal?.dataset.ligne, "erreur");
    assert.equal(refusal?.className, "dit refus");
    assert.equal(refusal?.role, "alert");
    assert.match(refusal?.textContent ?? "", /^nothing was proposed: GitHub refused/);
  });

  test("sa feuille ne nomme aucun écran, et vue.css ne dessine aucune rangée de réglage", () => {
    const feuille = sansCommentaires(readFileSync(join(VUE, "composants/setting/setting.css"), "utf8"));
    assert.doesNotMatch(feuille, /#[a-z]/);
    const vue = sansCommentaires(readFileSync(join(VUE, "vue.css"), "utf8"));
    assert.doesNotMatch(vue, /\.reglage(?![\w-])/);
    assert.doesNotMatch(vue, /\.bascule|\.glissiere/);
  });

  test("aucun écran n'écrit une rangée de réglage à la main : elles passent toutes par la rangée de l'app", () => {
    const a_la_main = fichiers(VUE)
      .filter((fichier) => fichier.endsWith(".js") && !fichier.endsWith(join("composants", "setting", "setting.js")))
      .filter((fichier) => /className = ["`]reglage[" `]/.test(readFileSync(fichier, "utf8")))
      .map((fichier) => relative(VUE, fichier));
    assert.deepEqual(a_la_main, []);
  });
});
