// La page d'un projet qui cuit sur cet ordinateur (#1124) : quand la station de cet ordinateur ne
// tourne pas, rien n'en est lu, et la page le dit en une ligne au lieu de rester vide. Dès que la
// station tourne, le rail, la file et les cartes reprennent la place de cette ligne, sans
// redémarrer l'app. Un projet servi par une autre station ne la porte jamais.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { forTheBar } from "../src/bar.ts";
import { EXAMPLE } from "../src/config.ts";
import { PALETTE } from "../src/colors.ts";

import { HEADINGS } from "../src/tabs.ts";
import { EFFORTS, MODELS } from "../src/projects/projects.ts";
import type { Terminal } from "../src/terminals.ts";
import { type Played, playTheVue, repos } from "./helpers/false-vue.ts";

const LINE = "this computer's station is not running";
const CONFIGURATION = { chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade" }, { nom: "cantine", dossier: "/tmp/cantine" }] };
const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "second · claude", note: "session neuve", arrete: false };
const served = (project: { nom: string }) => project.nom === "cantine";
const here = (name: string) => name === "parade";

describe("la station de cet ordinateur ne tourne pas : la barre le marque sur les projets qui cuisent ici", () => {
  test("seul un projet qui cuit ici porte « sansStation » — pas celui d'une autre station, pas quand la station tourne", () => {
    const stopped = forTheBar(CONFIGURATION, served, here, () => false).projets;
    assert.equal(stopped[0]?.sansStation, true);
    assert.equal(stopped[1]?.sansStation, undefined);
    const runs = forTheBar(CONFIGURATION, served, here, () => true).projets;
    assert.equal(runs[0]?.sansStation, undefined);
    // Sans rien dire de la station (la barre d'avant), personne n'est marqué.
    assert.equal(forTheBar(CONFIGURATION, undefined, here).projets[0]?.sansStation, undefined);
  });
});

const startup = (runs: boolean) => () => ({
  configuration: forTheBar(CONFIGURATION, served, here, () => runs),
  palette: PALETTE,
  exemple: EXAMPLE,
  rubriques: HEADINGS,
  gestes: {},
  calibrage: { modeles: MODELS, efforts: EFFORTS },
  });

async function open(runs: boolean, rank: number): Promise<Played> {
  const vue = await playTheVue({ demarrage: startup(runs), espace: () => [SECOND] });
  (vue.element("projets").children.at(rank) ?? assert.fail("pas d'entrée")).click();
  await repos();
  return vue;
}

// Ce que la page de l'espace dit au centre : le rail, ou la ligne qui le remplace.
const center = (vue: Played) => vue.element("rail");

describe("la page d'un projet qui cuit ici, station arrêtée", () => {
  test("une seule ligne dit que la station de cet ordinateur ne tourne pas — ni page vide, ni rail, ni carte", async () => {
    const vue = await open(false, 1);

    assert.equal(center(vue).hidden, false);
    assert.equal(center(vue).textContent, LINE);
    assert.equal(center(vue).children.length, 1);
    assert.ok(!vue.poses().some(({ id }) => id === "carte"));
    assert.ok(!vue.poses().some(({ id }) => id === "lu-cuisine" || id === "lecture-cuisine"));
  });

  test("la station démarre : la configuration reposée enlève la ligne, et le rail reprend sa place — l'app n'est pas relancée", async () => {
    const vue = await open(false, 1);
    assert.equal(center(vue).textContent, LINE);

    vue.dire("surConfiguration", forTheBar(CONFIGURATION, served, here, () => true), []);
    await repos();

    assert.equal(center(vue).hidden, false);
    assert.doesNotMatch(center(vue).textContent, /not running/);
    assert.match(center(vue).textContent, /first read of/);
  });

  test("la station s'arrête sous une page ouverte : la ligne revient", async () => {
    const vue = await open(true, 1);
    assert.doesNotMatch(center(vue).textContent, /not running/);

    vue.dire("surConfiguration", forTheBar(CONFIGURATION, served, here, () => false), []);
    await repos();

    assert.equal(center(vue).textContent, LINE);
  });

  test("un projet servi par une autre station ne porte jamais la ligne, station arrêtée ou non", async () => {
    for (const runs of [false, true]) {
      const vue = await open(runs, 2);
      assert.doesNotMatch(center(vue).textContent, /not running/);
      assert.equal(center(vue).hidden, false);
    }
  });
});
