// Les projets d'une station, sur sa page, la vue jouée (#3403) : une liste qui se lit seulement — les projets de l'app que
// la station sert, chacun un lien vers l'onglet Stations du projet. Un projet n'y est que si cet onglet montre la station ;
// ni « remove », ni « + add a project », ni case, ni champ. Sans projet servi, une phrase le dit. La liste vient de ce que la
// station publie (stations/document.ts), la même que lit l'onglet (stations-tab/state.js).
import assert from "node:assert/strict";
import { test } from "node:test";
import { lineOfStation, type Home } from "../../src/home.ts";
import { forTheBar } from "../../src/bar.ts";
import { EXAMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/colors.ts";
import { BANNER } from "../../src/facts.ts";
import { calibrationRecommended, EFFORTS, MODELS } from "../../src/projects/projects.ts";
import { TABS, HEADINGS } from "../../src/tabs.ts";
import type { SeenOfProjects } from "../../src/projects/projects.ts";
import type { StationVue } from "../../src/stations/stations.ts";
import { NO } from "../../src/vue/station/page/StationProjects.js";
import { type Fake, playTheVue, openAllTheStations, repos } from "../helpers/false-vue.ts";

const A = "2026-10-16T12:00:00.000Z";
// La box porte trois projets : « parade », ajouté depuis l'app ; « cantine » et « brigade », écrits à
// la main dans sa configuration. Le macbook est la station secondaire de « parade » ; l'atelier n'a rien.
const BOX: StationVue = { id: "g1", nom: "box", machine: "Linux 6.1.0-47-amd64", etat: "en-ligne", ligne: "online · version 1.4.0 · 3 projects: parade, cantine, brigade", dit: "online", version: "1.4.0", projets: ["parade", "cantine", "brigade"], max: "connectee" };
const MAC: StationVue = { ...BOX, id: "g2", nom: "macbook", machine: "macOS 25.0.0", ligne: "online · version 1.4.0 · no project", projets: [] };
const ATELIER: StationVue = { ...BOX, id: "g3", nom: "atelier", machine: "Debian 12 · 8 cores", ligne: "online · version 1.4.0 · no project", projets: [] };
const HOME: Home = {
  projets: [],
  stations: [lineOfStation(BOX, 1), lineOfStation(MAC, 0), lineOfStation(ATELIER, 0)],
  sante: { ton: "vert", dit: "Max ✓  ·  GitHub ✓", survol: "" },
};
const PARADE: SeenOfProjects = {
  a: A,
  projets: [
    {
      nom: "parade",
      depot: "benomite/parade",
      base: "main",
      suiviPar: { id: "g1", nom: "box" },
      stations: [
        { id: "g1", nom: "box", etat: "servi", dit: "served by box", autoriser: [] },
        { id: "g2", nom: "macbook", etat: "attendu", dit: "macbook has not read it yet", autoriser: [] },
      ],
      servi: "served by box 1 min 12 s after “add a project” was opened",
    },
  ],
  recommandee: "g1",
  avertissements: {},
  machines: {},
  calibrage: calibrationRecommended([]),
};

// Le fichier des projets de l'app déclare « parade » et « cantine » ; « brigade » n'y est pas.
const startup = (projectsOfStations: SeenOfProjects | undefined) => () => ({
  configuration: forTheBar({
    chemin: "/tmp/app.json",
    projets: [
      { nom: "parade", dossier: "/tmp/parade" },
      { nom: "cantine", dossier: "/tmp/cantine" },
    ],
  }, () => true),
  palette: PALETTE,
  exemple: EXAMPLE,
  onglets: TABS,
  rubriques: HEADINGS,
  gestes: {},
  banniere: BANNER,
  calibrage: { modeles: MODELS, efforts: EFFORTS },
  code: undefined,
  stations: { a: A, stations: [BOX, MAC, ATELIER] },
  accueil: HOME,
  ...(projectsOfStations === undefined ? {} : { projetsDesStations: projectsOfStations }),
});

// L'app ouverte sur l'accueil, puis la page de la station `nom` ouverte d'un clic sur sa ligne.
async function thePage(name: string, projects: SeenOfProjects | undefined = PARADE) {
  const played = await playTheVue({
    demarrage: startup(projects),
    depotsDuChef: () => ({ depots: [{ depot: "benomite/parade", base: "main" }] }),
    retirerDUneStation: (project) => ({ retire: project }),
    espace: () => [],
  });
  await openAllTheStations(played);
  (played.element("toutes-les-stations").dessous("button").find(({ className, textContent }) => className === "ligne" && textContent.startsWith(name)) ?? assert.fail(`pas de ligne « ${name} »`)).click();
  await repos();
  const page = played.element("station");
  return { jouee: played, page };
}

// Le bloc des projets de la page, et ses liens : un par projet, dans l'ordre des projets de l'app.
const block = (page: Fake) => page.dessous("section").find(({ className }) => className === "projets-servis-par-la-station") ?? assert.fail("pas de bloc des projets");
const links = (page: Fake) => block(page).dessous("a");
const names = (page: Fake) => links(page).map(({ dataset }) => dataset.projet);

test("la box sert trois projets, deux sont à l'app : sa page liste ces deux-là, une seule liste, rien d'autre", async () => {
  const { page } = await thePage("box");
  // « brigade » est écrit à la main dans la configuration de la box, mais l'app n'en a pas l'onglet : pas de lien à lui donner.
  assert.deepEqual(names(page), ["parade", "cantine"]);
  assert.equal(page.dessous("section").filter(({ className }) => className === "projets-servis-par-la-station").length, 1);
  assert.equal(block(page).dessous("h3")[0]?.textContent, "Projects it serves");
  assert.doesNotMatch(page.textContent, /Projects it serves.*Projects it serves|no project|none yet|add another repository/s);
  assert.doesNotMatch(page.textContent, new RegExp(NO));
});

test("la page ne propose aucun geste d'édition : ni « remove », ni « + add a project », ni case, ni champ, ni formulaire", async () => {
  const { jouee: played, page } = await thePage("box");
  const buttons = page.dessous("button").map(({ textContent }) => textContent);
  assert.ok(!buttons.includes("remove"), "pas de « remove »");
  assert.ok(!buttons.some((text) => /add a project/i.test(text)), "pas de « + add a project »");
  assert.ok(!buttons.some((text) => /^authorize on GitHub/.test(text)));
  assert.equal(page.dessous("input").length, 0, "ni case, ni champ");
  assert.equal(page.dessous("select").length, 0);
  assert.equal(page.dessous("form").length, 0);
  assert.equal(block(page).dessous("button").length, 0);
  assert.ok(!played.appels.some(({ geste: action }) => action === "depotsDuChef" || action === "retirerDUneStation"));
});

test("la liste se lit sans attendre ce que l'app a demandé : ce que la station publie suffit, et la lecture tardive ne change rien", async () => {
  const { jouee: played, page } = await thePage("box", undefined);
  assert.deepEqual(names(page), ["parade", "cantine"]);
  played.dire("surProjetsDesStations", PARADE);
  await repos();
  assert.deepEqual(names(page), ["parade", "cantine"]);
});

test("un projet que l'app a demandé à la station sans qu'elle le serve ne s'y liste pas : l'onglet ne l'y montre pas non plus", async () => {
  const { page } = await thePage("macbook");
  // PARADE nomme le macbook, mais « macbook has not read it yet » : il ne sert rien.
  assert.deepEqual(names(page), []);
});

test("un clic sur un projet ouvre l'onglet Stations de ce projet, où la station est montrée", async () => {
  const { jouee: played, page } = await thePage("box");
  const link = links(page).find(({ dataset }) => dataset.projet === "cantine") ?? assert.fail("pas de lien « cantine »");
  link.click();
  await repos();
  // La barre : « Tous les projets », « parade », « cantine », puis « + ».
  assert.equal(played.element("projets").children[2]?.ariaCurrent, "true", "l'espace de cantine est ouvert");
  const tab = played.element("rail").children.find(({ dataset }) => dataset.bloc === "stations-tab") ?? assert.fail("l'onglet Stations n'est pas ouvert");
  assert.deepEqual(tab.dessous("section").filter(({ className }) => className === "carte-de-station").map(({ ariaLabel }) => ariaLabel), ["box"]);
});

test("un clic sur « parade » ouvre aussi l'onglet Stations de parade", async () => {
  const { jouee: played, page } = await thePage("box");
  (links(page).find(({ dataset }) => dataset.projet === "parade") ?? assert.fail("pas de lien « parade »")).click();
  await repos();
  assert.equal(played.element("projets").children[1]?.ariaCurrent, "true", "l'espace de parade est ouvert");
  assert.ok(played.element("rail").children.some(({ dataset }) => dataset.bloc === "stations-tab"));
});

test("une station qui ne sert aucun projet dit, en mots simples, qu'elle n'en sert pas — un bloc jamais vide", async () => {
  for (const name of ["atelier", "macbook"]) {
    const { page } = await thePage(name);
    assert.deepEqual(names(page), []);
    assert.equal(block(page).dessous("p").find(({ dataset }) => dataset.ligne === "vide")?.textContent, NO);
  }
  const { page: scope } = await thePage("box");
  assert.ok(!block(scope).dessous("p").some(({ dataset }) => dataset.ligne === "vide"), "la box sert des projets : rien ne dit qu'elle n'en a aucun");
});
