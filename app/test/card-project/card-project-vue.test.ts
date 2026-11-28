// La fiche du projet dans l'app (#4240) : le projet ouvert montre sa fiche sous Settings, lue et écrite par le pont
// (`lireUnFichierDuProjet`, `ecrireUnFichierDuProjet`, que main.ts sert depuis le dossier du projet). La vue est jouée telle
// qu'elle est, devant un faux document et un faux pont (helpers/false-vue.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { forTheBar } from "../../src/bar.ts";
import { EXAMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/colors.ts";

import { HEADINGS } from "../../src/tabs.ts";
import { EFFORTS, MODELS } from "../../src/projects/projects.ts";
import { mountTheCardProject } from "../../src/vue/card-project/mount-card-project.js";

const CARD = ".brigade/fiche-projet.json";
const EMPTY = "No project sheet yet.";
import { Fake, playTheVue, repos } from "../helpers/false-vue.ts";

const PARADE = "parade";
const startup = () => ({
  configuration: forTheBar({ chemin: "/tmp/app.json", projets: [{ nom: PARADE, dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE,
  exemple: EXAMPLE,
  rubriques: HEADINGS,
  gestes: {},
  calibrage: { modeles: MODELS, efforts: EFFORTS },
  });
const FULL = { work: "an episode", stages: ["script", "render"], tools: [], rules: [], risks: ["publishing"], served: "the published episode", recurring: [], humans: ["the chef"] };
const doc = { createElement: (balise: string) => new Fake(balise) };
const field = (root: Fake, key: string) => [...root.descendants()].find((pose) => pose.dataset.item === key) ?? assert.fail(`pas de champ ${key}`);

describe("Settings : la fiche du projet ouvert", () => {
  test("le projet ouvert : sa fiche lue par le pont, posée sous Settings ; « Save » l'écrit par le pont", async () => {
    const vue = await playTheVue({ demarrage: startup, espace: () => [], lireUnFichierDuProjet: () => JSON.stringify(FULL), ecrireUnFichierDuProjet: async () => undefined });
    (vue.element("projets").children.at(1) ?? assert.fail("pas de case pour parade")).click();
    await repos();
    await repos();
    const container = vue.element("fiche-du-projet");
    assert.deepEqual(vue.appels.filter(({ geste: action }) => action === "lireUnFichierDuProjet").map(({ args }) => args), [[PARADE, CARD]]);
    assert.equal(container.hidden, false);
    assert.equal(field(container, "served").value, "the published episode");
    field(container, "work").value = "a podcast";
    [...container.descendants()].find((pose) => pose.dataset.geste === "enregistrer")?.click();
    await repos();
    const [written] = vue.appels.filter(({ geste: action }) => action === "ecrireUnFichierDuProjet").map(({ args }) => args);
    assert.equal(written?.[0], PARADE);
    assert.equal(written?.[1], CARD);
    assert.equal(JSON.parse(String(written?.[2])).work, "a podcast");
  });

  test("le projet sans fiche : la ligne vide, sous Settings", async () => {
    const vue = await playTheVue({ demarrage: startup, espace: () => [], lireUnFichierDuProjet: () => null });
    (vue.element("projets").children.at(1) ?? assert.fail("pas de case pour parade")).click();
    await repos();
    await repos();
    assert.equal(vue.element("fiche-du-projet").hidden, false);
    assert.ok(vue.element("fiche-du-projet").textContent.includes(EMPTY));
    assert.equal(vue.appels.filter(({ geste: action }) => action === "ecrireUnFichierDuProjet").length, 0);
  });
});

describe("monterLaFicheProjet", () => {
  test("un pont qui ne lit ou n'écrit pas les fichiers du projet (le téléphone) : la section ne se pose pas, et ce qu'elle montrait part", async () => {
    for (const bridge of [{}, { lireUnFichierDuProjet: async () => "{}" }, { ecrireUnFichierDuProjet: async () => undefined }]) {
      const container = new Fake("div");
      container.append(new Fake("section"));
      container.hidden = false;
      await mountTheCardProject(doc, container, { projet: PARADE, pont: bridge });
      assert.equal(container.hidden, true);
      assert.equal(container.children.length, 0);
    }
  });

  test("une lecture qui arrive pour un projet quitté depuis ne se pose pas : celle du projet ouvert reste", async () => {
    const container = new Fake("div");
    let release = (_text: string) => {};
    const slow = { lireUnFichierDuProjet: () => new Promise<string>((render) => (release = render)), ecrireUnFichierDuProjet: async () => undefined };
    const bright = { lireUnFichierDuProjet: async () => null, ecrireUnFichierDuProjet: async () => undefined };
    const quits = mountTheCardProject(doc, container, { projet: "autre", pont: slow });
    await mountTheCardProject(doc, container, { projet: PARADE, pont: bright });
    release(JSON.stringify(FULL));
    await quits;
    assert.equal(container.dataset.projet, PARADE);
    assert.equal(container.hidden, false);
    assert.ok(container.textContent.includes(EMPTY));
    assert.equal([...container.descendants()].filter((pose) => pose.dataset.item !== undefined).length, 0);
  });
});
