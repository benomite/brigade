// La rangée de réglage de l'app (vue/composants/reglage, ticket 2920) : une seule pour chaque réglage de chaque écran — son
// nom et son niveau, sa valeur, son contrôle, qui s'applique dès qu'il change ; un réglage gardé dans le dépôt le dit en
// une ligne sur sa rangée ; dessous, ce que le dernier changement a rendu. Sa peau est dans sa feuille à elle : aucune
// règle de vue.css ne dessine une rangée de réglage, et aucun écran n'en écrit une à la main.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, test } from "node:test";
import { ditDuReglage, PAR_PR, PROPOSE, rangeeDeReglage } from "../../../src/vue/composants/reglage/reglage.js";
import { niveauDe } from "../../../src/vue/niveaux.js";
import { Faux } from "../../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const VUE = join(import.meta.dirname, "../../../src/vue");
const sansCommentaires = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const fichiers = (dossier: string): string[] => readdirSync(dossier).flatMap((nom) => (statSync(join(dossier, nom)).isDirectory() ? fichiers(join(dossier, nom)) : [join(dossier, nom)]));

describe("la rangée de réglage", () => {
  test("son nom et la marque de son niveau, sa valeur, son contrôle, puis ce qu'il a rendu", () => {
    const champ = new Faux("input");
    const refus = new Faux("p");
    const rangee = rangeeDeReglage(doc, { nom: "cooks at once", cle: "cooks", niveau: niveauDe(doc, "cooks"), valeur: ["2"], controle: [champ], dessous: [refus] });
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
      rangeeDeReglage(doc, { nom: "calibration ceiling", niveau: niveauDe(doc, "plafond"), controle: [new Faux("select")] }),
      rangeeDeReglage(doc, { nom: "max cook duration", depot: true, controle: [new Faux("input")] }),
    ]) {
      assert.equal(rangee.dataset.depot, "");
      const ligne = rangee.children.find((pose: Faux) => pose.className === "par-pr");
      assert.equal(ligne?.textContent, PAR_PR);
      // La ligne suit le contrôle, avant ce que le changement a rendu.
      assert.equal(rangee.children.indexOf(ligne as Faux), 3);
    }
    // `depot: false` l'emporte sur le niveau.
    assert.equal(rangeeDeReglage(doc, { nom: "x", niveau: niveauDe(doc, "plafond"), depot: false }).dataset.depot, undefined);
  });

  test("ce que le dernier changement a rendu : rien, en route, fait, la PR ouverte et son bouton, ou le refus en une ligne", () => {
    assert.deepEqual(ditDuReglage(doc, undefined), []);
    assert.deepEqual(ditDuReglage(doc, { refus: "" }), []);
    const [enCours] = ditDuReglage(doc, { enCours: "proposing…" });
    assert.equal(enCours?.className, "dit en-cours");
    assert.equal(enCours?.textContent, "proposing…");
    const [fait] = ditDuReglage(doc, { fait: "applied" });
    assert.equal(fait?.className, "dit fait");
    const ouvertes: string[] = [];
    const [pr] = ditDuReglage(doc, { pr: "https://github.com/o/r/pull/51", numero: 51, valeur: "sonnet / high" }, { ouvrir: (url) => ouvertes.push(url) });
    assert.equal(pr?.className, "dit propose");
    assert.equal(pr?.children[0]?.textContent, `sonnet / high ${PROPOSE}`);
    const bouton = pr?.dessous("button")[0] ?? assert.fail("pas de bouton de la PR");
    assert.equal(bouton.textContent, "pull request #51");
    assert.equal(bouton.title, "https://github.com/o/r/pull/51");
    bouton.click();
    assert.deepEqual(ouvertes, ["https://github.com/o/r/pull/51"]);
    const [refus] = ditDuReglage(doc, { refus: "nothing was proposed: GitHub refused", detail: "422" });
    assert.equal(refus?.dataset.ligne, "erreur");
    assert.equal(refus?.className, "dit refus");
    assert.equal(refus?.role, "alert");
    assert.match(refus?.textContent ?? "", /^nothing was proposed: GitHub refused/);
  });

  test("sa feuille ne nomme aucun écran, et vue.css ne dessine aucune rangée de réglage", () => {
    const feuille = sansCommentaires(readFileSync(join(VUE, "composants/reglage/reglage.css"), "utf8"));
    assert.doesNotMatch(feuille, /#[a-z]/);
    const vue = sansCommentaires(readFileSync(join(VUE, "vue.css"), "utf8"));
    assert.doesNotMatch(vue, /\.reglage(?![\w-])/);
    assert.doesNotMatch(vue, /\.bascule|\.glissiere/);
  });

  test("aucun écran n'écrit une rangée de réglage à la main : elles passent toutes par la rangée de l'app", () => {
    const a_la_main = fichiers(VUE)
      .filter((fichier) => fichier.endsWith(".js") && !fichier.endsWith(join("composants", "reglage", "reglage.js")))
      .filter((fichier) => /className = ["`]reglage[" `]/.test(readFileSync(fichier, "utf8")))
      .map((fichier) => relative(VUE, fichier));
    assert.deepEqual(a_la_main, []);
  });
});
