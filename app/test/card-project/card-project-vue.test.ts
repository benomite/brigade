// La fiche du projet dans l'app (#4240) : le projet ouvert montre sa fiche sous Settings, lue et écrite par le pont
// (`lireUnFichierDuProjet`, `ecrireUnFichierDuProjet`, que main.ts sert depuis le dossier du projet). La vue est jouée telle
// qu'elle est, devant un faux document et un faux pont (helpers/false-vue.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { mountTheCardProject } from "../../src/vue/card-project/mount-card-project.js";

const CARD = ".brigade/fiche-projet.json";
const EMPTY = "No project sheet yet.";
import { Fake } from "../helpers/false-vue.ts";

const PARADE = "parade";
const FULL = { work: "an episode", stages: ["script", "render"], tools: [], rules: [], risks: ["publishing"], served: "the published episode", recurring: [], humans: ["the chef"] };
const doc = { createElement: (balise: string) => new Fake(balise) };
const field = (root: Fake, key: string) => [...root.descendants()].find((pose) => pose.dataset.item === key) ?? assert.fail(`pas de champ ${key}`);

describe("Settings : la fiche du projet ouvert", () => {

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
