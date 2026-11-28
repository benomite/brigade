// La liste des projets que sert la station de cet ordinateur se change sur l'onglet Stations d'un projet (#3402) : « Add a
// station » y ajoute cet ordinateur même quand une autre station le cuit déjà, « Stop cooking here » l'en retire. Après
// chaque geste, l'onglet montre la liste écrite — et l'app rouverte la montre encore ; un geste qui ne s'applique pas le
// dit en une ligne, et son bouton reste. La vue est jouée entière contre le faux pont ; derrière lui, la liste de la
// station est tenue par le test, qui la lit, y ajoute ou en retire un dépôt.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Home } from "../../../src/home.ts";
import { forTheBar } from "../../../src/bar.ts";
import { EXAMPLE, type Project } from "../../../src/config.ts";
import { PALETTE } from "../../../src/colors.ts";

import { TABS, HEADINGS } from "../../../src/tabs.ts";
import { calibrationRecommended, EFFORTS, machineProposed, MODELS, type ProjectSeen, type SeenOfProjects } from "../../../src/projects/projects.ts";
import type { StationVue, SeenOfStations } from "../../../src/stations/stations.ts";
import { DONE_HERE } from "../../../src/vue/project/stations/AddStation.js";
import { STILL_SERVED, REMOVED } from "../../../src/vue/project/stations/StopStation.js";
import { ADD, STOP, YES_STOP, WHO_OF_OTHER } from "../../../src/vue/stations-tab/stations-tab.js";
import { THIS_COMPUTER } from "../../../src/vue/lexicon.js";
import { type Fake, type Played, playTheVue, openTab, repos } from "../../helpers/false-vue.ts";

const A = "2026-11-12T10:00:00.000Z";
const REPOSITORY = "benomite/parade";
const BOX: StationVue = { id: "gbox", nom: "parade-box", machine: "Linux 6.1.0", coeurs: 8, etat: "en-ligne", ligne: "online", dit: "online", version: "2.4.0", projets: ["parade"], max: "connectee" };
// Cet ordinateur : sa station, appairée, qui publie ne rien servir — sa liste, elle, est sur ce disque.
const MAC: StationVue = { id: "gmac", nom: "macbook", machine: "macOS 25.0.0", coeurs: 12, etat: "en-ligne", ligne: "online", dit: "online", version: "2.4.0", projets: [], max: "connectee" };
const HOME: Home = { projets: [], stations: [], sante: { ton: "vert", dit: "Max ✓  ·  GitHub ✓", survol: "" } };
const PARADE: Project = { nom: "parade", dossier: "/tmp/parade", depot: REPOSITORY, base: "main" };
const station = (id: string, name: string) => ({ id, nom: name, etat: "servi" as const, dit: "", autoriser: [] });
const ON_THE_BOX: ProjectSeen = { nom: "parade", depot: REPOSITORY, base: "main", suiviPar: { id: "gbox", nom: "parade-box" }, stations: [station("gbox", "parade-box")], servi: null, cuitSur: { id: "gbox", nom: "parade-box", ici: false }, demenagement: null };
const SEEN: SeenOfProjects = { a: A, projets: [ON_THE_BOX], locale: "gmac", recommandee: "gbox", avertissements: {}, machines: { gbox: machineProposed(BOX), gmac: machineProposed(MAC) }, calibrage: calibrationRecommended([]) };

// La station de cet ordinateur, neuve : la liste de ses projets, vide.
type Station = { depots: string[] };
const theStation = (): Station => ({ depots: [] });

type List = { depots: string[] } | { refus: string };
// La liste derrière le pont : la lire, y ajouter ou en retirer un dépôt. `ecrire` remplace l'écriture, pour un refus ou une
// réponse qui ne change rien.
function bridgeOfTheList(root: Station, write?: (repository: string, served: boolean) => List) {
  return {
    projetsServis: (): List => ({ depots: [...root.depots] }),
    servirUnProjet: (repository: unknown, served: unknown): List => {
      if (write !== undefined) return write(String(repository), served === true);
      const depot = String(repository);
      root.depots = served === true ? [...root.depots.filter((one) => one !== depot), depot] : root.depots.filter((one) => one !== depot);
      return { depots: [...root.depots] };
    },
  };
}

// L'app ouverte sur l'onglet Stations de parade, devant cette station : la box le cuit, et publie le servir.
async function theTab(root: Station, write?: (repository: string, served: boolean) => List) {
  const vue = await playTheVue({
    demarrage: () => ({
      configuration: forTheBar({ chemin: "/tmp/app.json", projets: [PARADE] }),
      palette: PALETTE,
      exemple: EXAMPLE,
      onglets: TABS,
      rubriques: HEADINGS,
      gestes: {},
      calibrage: { modeles: MODELS, efforts: EFFORTS },
      stations: { a: A, stations: [BOX, MAC] } satisfies SeenOfStations,
      accueil: HOME,
      projetsDesStations: SEEN,
    }),
    espace: () => [],
    stationsDuCompte: () => ({ state: "listed", stations: [], unreadable: [] }),
    ...bridgeOfTheList(root, write),
  });
  (vue.element("projets").children.at(1) ?? assert.fail("pas de case « parade »")).click();
  await repos();
  await openTab(vue, "Stations");
  await repos();
  return vue;
}

const tab = (vue: Played) => vue.element("rail").children.find(({ dataset }) => dataset.bloc === "stations-tab") ?? assert.fail("pas d'onglet des stations");
const top = (vue: Played) => tab(vue).children.find(({ className }) => className === "haut-des-stations") ?? assert.fail("pas de ligne du haut");
const cards = (vue: Played) => tab(vue).dessous("section").filter(({ className }) => className === "carte-de-station");
const card = (vue: Played, name: string) => cards(vue).find(({ ariaLabel }) => ariaLabel === name) ?? assert.fail(`pas de carte « ${name} »`);
const buttons = (or: Fake) => or.dessous("button").filter(({ className }) => className !== "aide");
const button = (or: Fake, text: string) => buttons(or).find((candidate) => candidate.textContent === text) ?? assert.fail(`pas de bouton « ${text} »`);
// Ce que la ligne sous le haut dit du dernier geste.
const said = (vue: Played) => tab(vue).dessous("p").find(({ className }) => className.includes("dit-des-stations"))?.textContent ?? "";
const choice = (vue: Played) => tab(vue).dessous("section").find(({ className }) => className === "choix-des-stations");
const servedOnes = (vue: Played) => vue.appels.filter(({ geste: action }) => action === "servirUnProjet").map(({ args }) => args);

// « Stop cooking here » sur une carte, puis son « yes ».
async function stop(vue: Played, name: string) {
  button(card(vue, name), STOP).click();
  await repos();
  button(card(vue, name), YES_STOP).click();
  await repos();
  await repos();
}

describe("ajouter une station depuis l'onglet (#3402)", () => {
  test("la box le cuit déjà : « Add a station » ouvre le choix, cet ordinateur choisi entre dans la liste, et sa carte est là — encore après une réouverture", async () => {
    const root = theStation();
    const vue = await theTab(root);
    assert.deepEqual(cards(vue).map(({ ariaLabel }) => ariaLabel), ["parade-box"]);
    button(top(vue), ADD).click();
    await repos();
    const opened = choice(vue) ?? assert.fail("le choix ne s'ouvre pas");
    assert.equal(opened.ariaLabel, WHO_OF_OTHER("parade"));
    button(opened, THIS_COMPUTER).click();
    await repos();
    await repos();
    assert.deepEqual(servedOnes(vue), [[REPOSITORY, true]]);
    // La liste de la station le porte.
    assert.deepEqual(root.depots, [REPOSITORY]);
    // L'onglet montre ce que la liste dit, avant que la station ne le publie : cet ordinateur le sert.
    assert.deepEqual(cards(vue).map(({ ariaLabel }) => ariaLabel), ["macbook", "parade-box"]);
    assert.equal(said(vue), DONE_HERE(THIS_COMPUTER, "parade"));
    button(card(vue, "macbook"), STOP);

    const reopened = await theTab(root);
    assert.deepEqual(cards(reopened).map(({ ariaLabel }) => ariaLabel), ["macbook", "parade-box"]);
  });
});

describe("arrêter une station depuis l'onglet (#3402)", () => {
  test("cet ordinateur le sert : « Stop cooking here » le retire de sa liste, sa carte part et la ligne le dit — encore après une réouverture", async () => {
    const root = theStation();
    root.depots.push(REPOSITORY);
    const vue = await theTab(root);
    assert.deepEqual(cards(vue).map(({ ariaLabel }) => ariaLabel), ["macbook", "parade-box"]);
    await stop(vue, "macbook");
    assert.deepEqual(servedOnes(vue), [[REPOSITORY, false]]);
    assert.deepEqual(root.depots, []);
    assert.equal(said(vue), REMOVED("macbook", "parade"));
    assert.deepEqual(cards(vue).map(({ ariaLabel }) => ariaLabel), ["parade-box"]);

    // Rouverte, même si la station publiait encore le servir, l'app lit sa liste : il n'y est plus.
    const reopened = await theTab(root);
    assert.deepEqual(cards(reopened).map(({ ariaLabel }) => ariaLabel), ["parade-box"]);
  });

  test("un retrait qui laisse le projet dans la liste le dit, et la carte garde son bouton", async () => {
    const root = theStation();
    root.depots.push(REPOSITORY);
    // La station répond sans l'avoir retiré : c'est le chef qui cliquait « remove » et lisait encore « served ».
    const vue = await theTab(root, () => ({ depots: [...root.depots] }));
    await stop(vue, "macbook");
    assert.equal(said(vue), STILL_SERVED("macbook", "parade"));
    button(card(vue, "macbook"), STOP);
  });

  test("un retrait que la station refuse le dit en une ligne, et la carte garde son bouton", async () => {
    const root = theStation();
    root.depots.push(REPOSITORY);
    const vue = await theTab(root, () => ({ refus: "the station's configuration cannot be written — EACCES" }));
    await stop(vue, "macbook");
    assert.match(said(vue), /^nothing was changed: the station's configuration cannot be written/);
    assert.deepEqual(root.depots, [REPOSITORY]);
    button(card(vue, "macbook"), STOP);
  });
});
