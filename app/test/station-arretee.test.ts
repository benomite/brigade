// La page d'un projet qui cuit sur cet ordinateur (#1124) : quand la station de cet ordinateur ne
// tourne pas, rien n'en est lu, et la page le dit en une ligne au lieu de rester vide. Dès que la
// station tourne, le rail, la file et les cartes reprennent la place de cette ligne, sans
// redémarrer l'app. Un projet servi par une box ne la porte jamais.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../src/allumage.ts";
import { pourLaBarre } from "../src/barre.ts";
import { BOUTONS } from "../src/boutons.ts";
import type { Montree } from "../src/attend.ts";
import { EXEMPLE } from "../src/config.ts";
import { PALETTE } from "../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../src/cuisine.ts";
import { BANNIERE } from "../src/faits.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../src/grants.ts";
import { GESTES_DU_MANAGER } from "../src/manager.ts";
import { ONGLETS, RUBRIQUES } from "../src/onglets.ts";
import { EFFORTS, MODELES } from "../src/projets/projets.ts";
import type { Terminal } from "../src/terminaux.ts";
import { type Jouee, jouerLaVue, ouvrirOnglet, repos } from "./aides/fausse-vue.ts";

const LIGNE = "this computer's station is not running";
const CONFIGURATION = { chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade" }, { nom: "cantine", dossier: "/tmp/cantine", box: { hote: "box" } }], hotes: ["box"] };
const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "second · claude", note: "session neuve", arrete: false };
const ici = (nom: string) => nom === "parade";

describe("la station de cet ordinateur ne tourne pas : la barre le marque sur les projets qui cuisent ici", () => {
  test("seul un projet qui cuit ici porte « sansStation » — pas celui d'une box, pas quand la station tourne", () => {
    const arretee = pourLaBarre(CONFIGURATION, undefined, ici, () => false).projets;
    assert.equal(arretee[0]?.sansStation, true);
    assert.equal(arretee[1]?.sansStation, undefined);
    const tourne = pourLaBarre(CONFIGURATION, undefined, ici, () => true).projets;
    assert.equal(tourne[0]?.sansStation, undefined);
    // Sans rien dire de la station (la barre d'avant), personne n'est marqué.
    assert.equal(pourLaBarre(CONFIGURATION, undefined, ici).projets[0]?.sansStation, undefined);
  });
});

const demarrage = (tourne: boolean) => () => ({
  configuration: pourLaBarre(CONFIGURATION, undefined, ici, () => tourne),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  boutons: BOUTONS,
  gestes: { manager: GESTES_DU_MANAGER, allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
});

async function ouvrir(tourne: boolean, rang: number): Promise<Jouee> {
  const vue = await jouerLaVue({ demarrage: demarrage(tourne), espace: () => [SECOND] });
  (vue.element("projets").children.at(rang) ?? assert.fail("pas d'entrée")).click();
  await repos();
  return vue;
}

// Ce que la page de l'espace dit au centre : le rail, ou la ligne qui le remplace.
const centre = (vue: Jouee) => vue.element("rail");

describe("la page d'un projet qui cuit ici, station arrêtée", () => {
  test("une seule ligne dit que la station de cet ordinateur ne tourne pas — ni page vide, ni rail, ni carte", async () => {
    const vue = await ouvrir(false, 1);

    assert.equal(centre(vue).hidden, false);
    assert.equal(centre(vue).textContent, LIGNE);
    assert.equal(centre(vue).children.length, 1);
    assert.ok(!vue.poses().some(({ id }) => id === "carte"));
    assert.equal(vue.element("lu").textContent, "");
    // Sur l'onglet Cooks (#1184), la même ligne, seule : ni la carte du projet, ni la lecture de `station`.
    await ouvrirOnglet(vue, "Cooks");
    assert.equal(centre(vue).textContent, LIGNE);
    assert.equal(centre(vue).children.length, 1);
  });

  test("une lecture qui arrive quand même ne remplace pas la ligne", async () => {
    const vue = await ouvrir(false, 1);
    const lecture: Montree = { projet: "parade", demande: vue.dernier("regarder")[1] as number, a: "2026-10-20T10:00:00.000Z", sorties: [{ commande: "status", texte: "parade : rien" }], attend: undefined };

    vue.dire("surLecture", lecture, { projet: "parade", pages: [], aLancer: [], illisibles: [], empeche: [] });
    await repos();

    assert.equal(centre(vue).textContent, LIGNE);
    assert.equal(vue.element("lecture").textContent, "");
  });

  test("la station démarre : la configuration reposée enlève la ligne, et le rail reprend sa place — l'app n'est pas relancée", async () => {
    const vue = await ouvrir(false, 1);
    assert.equal(centre(vue).textContent, LIGNE);

    vue.dire("surConfiguration", pourLaBarre(CONFIGURATION, undefined, ici, () => true), []);
    await repos();

    assert.equal(centre(vue).hidden, false);
    assert.doesNotMatch(centre(vue).textContent, /not running/);
    assert.match(centre(vue).textContent, /first read of/);
  });

  test("la station s'arrête sous une page ouverte : la ligne revient", async () => {
    const vue = await ouvrir(true, 1);
    assert.doesNotMatch(centre(vue).textContent, /not running/);

    vue.dire("surConfiguration", pourLaBarre(CONFIGURATION, undefined, ici, () => false), []);
    await repos();

    assert.equal(centre(vue).textContent, LIGNE);
  });

  test("un projet servi par une box ne porte jamais la ligne, station arrêtée ou non", async () => {
    for (const tourne of [false, true]) {
      const vue = await ouvrir(tourne, 2);
      assert.doesNotMatch(centre(vue).textContent, /not running/);
      assert.equal(centre(vue).hidden, false);
    }
  });
});
