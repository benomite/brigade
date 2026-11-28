// La rangée de réglage de l'app (vue/components/setting, ticket 2920) : une seule pour chaque réglage de chaque écran — son
// nom et son niveau, sa valeur, son contrôle, qui s'applique dès qu'il change ; un réglage gardé dans le dépôt le dit en
// une ligne sur sa rangée ; dessous, ce que le dernier changement a rendu. Sa peau est dans sa feuille à elle : aucune
// règle de vue.css ne dessine une rangée de réglage, et aucun écran n'en écrit une à la main.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, test } from "node:test";
import { saysOfSetting, BY_PR, PROPOSES, rowOfSetting } from "../../../src/vue/components/setting/setting.js";
import { levelOf } from "../../../src/vue/levels.js";
import { levelSetting } from "../../../src/vue/station/page/SettingLevel.js";
import { Fake } from "../../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) };
const VUE = join(import.meta.dirname, "../../../src/vue");
const withoutComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const files = (folder: string): string[] => readdirSync(folder).flatMap((name) => (statSync(join(folder, name)).isDirectory() ? files(join(folder, name)) : [join(folder, name)]));

describe("la rangée de réglage", () => {
  test("son nom et la marque de son niveau, sa valeur, son contrôle, puis ce qu'il a rendu", () => {
    const field = new Fake("input");
    const refusal = new Fake("p");
    const row = rowOfSetting(doc, { nom: "cooks at once", cle: "dossier", niveau: levelOf(doc, "dossier"), valeur: ["2"], controle: [field], dessous: [refusal] });
    assert.equal(row.className, "reglage");
    assert.equal(row.dataset.cle, "dossier");
    assert.deepEqual(
      row.children.map((pose: Fake) => pose.className),
      ["nom", "valeur", "champ", ""],
    );
    assert.equal(row.children[0]?.textContent, "cooks at oncethis computer");
    assert.equal(row.children[2]?.children[0], field);
    // Un réglage de la machine ne passe pas par le dépôt : aucune ligne de PR.
    assert.equal(row.dataset.depot, undefined);
    assert.ok(!row.textContent.includes(BY_PR));
  });

  test("un réglage gardé dans le dépôt — son niveau « project », ou `depot` — dit sur sa rangée qu'un changement ouvre une PR", () => {
    for (const row of [
      rowOfSetting(doc, { nom: "calibration ceiling", niveau: levelSetting(doc, "project"), controle: [new Fake("select")] }),
      rowOfSetting(doc, { nom: "max cook duration", depot: true, controle: [new Fake("input")] }),
    ]) {
      assert.equal(row.dataset.depot, "");
      const line = row.children.find((pose: Fake) => pose.className === "par-pr");
      assert.equal(line?.textContent, BY_PR);
      // La ligne suit le contrôle, avant ce que le changement a rendu.
      assert.equal(row.children.indexOf(line as Fake), 3);
    }
    // `depot: false` l'emporte sur le niveau.
    assert.equal(rowOfSetting(doc, { nom: "x", niveau: levelSetting(doc, "project"), depot: false }).dataset.depot, undefined);
  });

  test("ce que le dernier changement a rendu : rien, en route, fait, la PR ouverte et son bouton, ou le refus en une ligne", () => {
    assert.deepEqual(saysOfSetting(doc, undefined), []);
    assert.deepEqual(saysOfSetting(doc, { refus: "" }), []);
    const [inProgress] = saysOfSetting(doc, { enCours: "proposing…" });
    assert.equal(inProgress?.className, "dit en-cours");
    assert.equal(inProgress?.textContent, "proposing…");
    const [done] = saysOfSetting(doc, { fait: "applied" });
    assert.equal(done?.className, "dit fait");
    const openEntries: string[] = [];
    const [pr] = saysOfSetting(doc, { pr: "https://github.com/o/r/pull/51", numero: 51, valeur: "sonnet / high" }, { ouvrir: (url) => openEntries.push(url) });
    assert.equal(pr?.className, "dit propose");
    assert.equal(pr?.children[0]?.textContent, `sonnet / high ${PROPOSES}`);
    const button = pr?.dessous("button")[0] ?? assert.fail("pas de bouton de la PR");
    assert.equal(button.textContent, "pull request #51");
    assert.equal(button.title, "https://github.com/o/r/pull/51");
    button.click();
    assert.deepEqual(openEntries, ["https://github.com/o/r/pull/51"]);
    const [refusal] = saysOfSetting(doc, { refus: "nothing was proposed: GitHub refused", detail: "422" });
    assert.equal(refusal?.dataset.ligne, "erreur");
    assert.equal(refusal?.className, "dit refus");
    assert.equal(refusal?.role, "alert");
    assert.match(refusal?.textContent ?? "", /^nothing was proposed: GitHub refused/);
  });

  test("sa feuille ne nomme aucun écran, et vue.css ne dessine aucune rangée de réglage", () => {
    const sheet = withoutComments(readFileSync(join(VUE, "components/setting/setting.css"), "utf8"));
    assert.doesNotMatch(sheet, /#[a-z]/);
    const vue = withoutComments(readFileSync(join(VUE, "vue.css"), "utf8"));
    assert.doesNotMatch(vue, /\.reglage(?![\w-])/);
    assert.doesNotMatch(vue, /\.bascule|\.glissiere/);
  });

  test("aucun écran n'écrit une rangée de réglage à la main : elles passent toutes par la rangée de l'app", () => {
    const a_The_main = files(VUE)
      .filter((file) => file.endsWith(".js") && !file.endsWith(join("components", "setting", "setting.js")))
      .filter((file) => /className = ["`]reglage[" `]/.test(readFileSync(file, "utf8")))
      .map((file) => relative(VUE, file));
    assert.deepEqual(a_The_main, []);
  });
});
