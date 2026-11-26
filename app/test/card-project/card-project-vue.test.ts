// La fiche du projet dans l'app (#4240) : le projet ouvert montre sa fiche sous Settings, lue et écrite par le pont
// (`lireUnFichierDuProjet`, `ecrireUnFichierDuProjet`, que main.ts sert depuis le dossier du projet). La vue est jouée telle
// qu'elle est, devant un faux document et un faux pont (aides/fausse-vue.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBar } from "../../src/bar.ts";
import { EXEMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { KITCHEN_ACTIONS } from "../../src/kitchen.ts";
import { BANNIERE } from "../../src/facts.ts";
import { CONFIRMES, DIRECTS } from "../../src/actions.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../src/projects/projects.ts";
import { monterLaCardProject } from "../../src/vue/card-project/monter-card-project.js";

const CARD = ".brigade/fiche-projet.json";
const EMPTY = "No project sheet yet.";
import { Faux, jouerLaVue, repos } from "../aides/fausse-vue.ts";

const PARADE = "parade";
const demarrage = () => ({
  configuration: pourLaBar({ chemin: "/tmp/app.json", projets: [{ nom: PARADE, dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: KITCHEN_ACTIONS, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
});
const PLEINE = { work: "an episode", stages: ["script", "render"], tools: [], rules: [], risks: ["publishing"], served: "the published episode", recurring: [], humans: ["the chef"] };
const doc = { createElement: (balise: string) => new Faux(balise) };
const champ = (racine: Faux, cle: string) => [...racine.descendants()].find((pose) => pose.dataset.item === cle) ?? assert.fail(`pas de champ ${cle}`);

describe("Settings : la fiche du projet ouvert", () => {
  test("le projet ouvert : sa fiche lue par le pont, posée sous Settings ; « Save » l'écrit par le pont", async () => {
    const vue = await jouerLaVue({ demarrage, espace: () => [], lireUnFichierDuProjet: () => JSON.stringify(PLEINE), ecrireUnFichierDuProjet: async () => undefined });
    (vue.element("projets").children.at(1) ?? assert.fail("pas de case pour parade")).click();
    await repos();
    await repos();
    const conteneur = vue.element("fiche-du-projet");
    assert.deepEqual(vue.appels.filter(({ geste: action }) => action === "lireUnFichierDuProjet").map(({ args }) => args), [[PARADE, CARD]]);
    assert.equal(conteneur.hidden, false);
    assert.equal(champ(conteneur, "served").value, "the published episode");
    champ(conteneur, "work").value = "a podcast";
    [...conteneur.descendants()].find((pose) => pose.dataset.geste === "enregistrer")?.click();
    await repos();
    const [ecrit] = vue.appels.filter(({ geste: action }) => action === "ecrireUnFichierDuProjet").map(({ args }) => args);
    assert.equal(ecrit?.[0], PARADE);
    assert.equal(ecrit?.[1], CARD);
    assert.equal(JSON.parse(String(ecrit?.[2])).work, "a podcast");
  });

  test("le projet sans fiche : la ligne vide, sous Settings", async () => {
    const vue = await jouerLaVue({ demarrage, espace: () => [], lireUnFichierDuProjet: () => null });
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
    for (const pont of [{}, { lireUnFichierDuProjet: async () => "{}" }, { ecrireUnFichierDuProjet: async () => undefined }]) {
      const conteneur = new Faux("div");
      conteneur.append(new Faux("section"));
      conteneur.hidden = false;
      await monterLaCardProject(doc, conteneur, { projet: PARADE, pont });
      assert.equal(conteneur.hidden, true);
      assert.equal(conteneur.children.length, 0);
    }
  });

  test("une lecture qui arrive pour un projet quitté depuis ne se pose pas : celle du projet ouvert reste", async () => {
    const conteneur = new Faux("div");
    let lacher = (_texte: string) => {};
    const lent = { lireUnFichierDuProjet: () => new Promise<string>((rendre) => (lacher = rendre)), ecrireUnFichierDuProjet: async () => undefined };
    const vif = { lireUnFichierDuProjet: async () => null, ecrireUnFichierDuProjet: async () => undefined };
    const quitte = monterLaCardProject(doc, conteneur, { projet: "autre", pont: lent });
    await monterLaCardProject(doc, conteneur, { projet: PARADE, pont: vif });
    lacher(JSON.stringify(PLEINE));
    await quitte;
    assert.equal(conteneur.dataset.projet, PARADE);
    assert.equal(conteneur.hidden, false);
    assert.ok(conteneur.textContent.includes(EMPTY));
    assert.equal([...conteneur.descendants()].filter((pose) => pose.dataset.item !== undefined).length, 0);
  });
});
