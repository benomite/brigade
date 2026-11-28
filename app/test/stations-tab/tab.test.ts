// L'onglet Stations d'un projet (#3195), la vue jouée : une seule ligne en tête, une carte par station qui sert le projet,
// « Details » replié, et « Move to another station » qui ouvre le choix — cet ordinateur d'abord — puis suit le déménagement
// sur la ligne du haut jusqu'à son terme, ou dit ce qui le bloque passée la minute (horloge simulée). Ni la cuisine locale,
// ni « + station », ni « not read yet », ni une station qui ne sert pas le projet ; « Add a station » (#3402) est le seul
// geste d'ajout.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Home } from "../../src/home.ts";
import { forTheBar } from "../../src/bar.ts";
import { EXAMPLE, type Project } from "../../src/config.ts";
import { PALETTE } from "../../src/colors.ts";

import { TABS, HEADINGS } from "../../src/tabs.ts";
import { calibrationRecommended, EFFORTS, machineProposed, MODELS, type Move, type ProjectSeen, type SeenOfProjects } from "../../src/projects/projects.ts";
import type { StationVue, SeenOfStations } from "../../src/stations/stations.ts";
import { ADD, STOP, DISPLACE, DETAILS } from "../../src/vue/stations-tab/stations-tab.js";
import { CHOOSE, NOBODY, TO_HERE } from "../../src/vue/stations-tab/state.js";
import { type Fake, type Played, playTheVue, openTab, repos } from "../helpers/false-vue.ts";

const A = "2026-11-11T10:00:00.000Z";
const BOX: StationVue = { id: "gbox", nom: "parade-box", machine: "Linux 6.1.0", coeurs: 8, etat: "en-ligne", ligne: "online", dit: "online", version: "2.4.0", projets: ["parade"], max: "connectee" };
const MAC: StationVue = { id: "gmac", nom: "macbook", machine: "macOS 25.0.0", coeurs: 12, etat: "en-ligne", ligne: "online", dit: "online", version: "2.4.0", projets: [], max: "connectee" };
const HOME: Home = { projets: [], stations: [], sante: { ton: "vert", dit: "Max ✓  ·  GitHub ✓", survol: "" } };
const PARADE: Project = { nom: "parade", dossier: "/tmp/parade", depot: "benomite/parade", base: "main" };
const station = (id: string, name: string) => ({ id, nom: name, etat: "servi" as const, dit: "", autoriser: [] });
// parade, confié depuis l'app à sa box, où il cuit.
const ON_THE_BOX: ProjectSeen = { nom: "parade", depot: "benomite/parade", base: "main", suiviPar: { id: "gbox", nom: "parade-box" }, stations: [station("gbox", "parade-box"), station("gmac", "macbook")], servi: null, cuitSur: { id: "gbox", nom: "parade-box", ici: false }, demenagement: null };
const seenOf = (project: ProjectSeen): SeenOfProjects => ({ a: A, projets: [project], locale: "gmac", recommandee: "gbox", avertissements: {}, machines: { gbox: machineProposed(BOX), gmac: machineProposed(MAC) }, calibrage: calibrationRecommended([]) });

async function thePage(stations: StationVue[], seenOne: SeenOfProjects, relocate: () => Move = () => ({ demenage: { projet: "parade", de: "parade-box", vers: "macbook" } })) {
  const played = await playTheVue({
    demarrage: () => ({
      configuration: forTheBar({ chemin: "/tmp/app.json", projets: [PARADE] }),
      palette: PALETTE,
      exemple: EXAMPLE,
      onglets: TABS,
      rubriques: HEADINGS,
      gestes: {},
      calibrage: { modeles: MODELS, efforts: EFFORTS },
      stations: { a: A, stations } satisfies SeenOfStations,
      accueil: HOME,
      projetsDesStations: seenOne,
    }),
    demenagerLaCuisine: relocate,
    espace: () => [],
  });
  (played.element("projets").children.at(1) ?? assert.fail("pas de case « parade »")).click();
  await repos();
  await openTab(played, "Stations");
  return played;
}

const tab = (vue: Played) => vue.element("rail").children.find(({ dataset }) => dataset.bloc === "stations-tab") ?? assert.fail("pas d'onglet des stations");
const top = (vue: Played) => tab(vue).children.find(({ className }) => className === "haut-des-stations") ?? assert.fail("pas de ligne du haut");
const sentence = (vue: Played) => top(vue).dessous("p").find(({ className }) => className === "phrase")?.dessous("strong")[0]?.textContent ?? "";
const cards = (vue: Played) => tab(vue).dessous("section").filter(({ className }) => className === "carte-de-station");
const button = (or: Fake, text: string) => or.dessous("button").find((candidate) => candidate.textContent === text) ?? assert.fail(`pas de bouton « ${text} »`);

describe("l'onglet Stations : une ligne en tête, une carte par station qui sert le projet (#3195)", () => {
  test("servi par la box : « Cooked by parade-box · online · idle… », vert ; une seule carte ; le Mac, qui ne le sert pas, nulle part", async () => {
    const vue = await thePage([BOX, MAC], seenOf(ON_THE_BOX));
    assert.equal(tab(vue).dessous("div").filter(({ className }) => className === "haut-des-stations").length, 1);
    assert.equal(sentence(vue), "Cooked by parade-box · online · idle, nothing on the rail");
    assert.equal(top(vue).dataset.ton, "vert");
    assert.deepEqual(cards(vue).map(({ ariaLabel }) => ariaLabel), ["parade-box"]);
    const text = tab(vue).textContent;
    for (const absent of ["macbook", "+ station", "not read yet", "Local station", "All stations", "Station settings", "kitchen", "does not serve"]) assert.equal(text.includes(absent), false, absent);
    // Un seul geste d'ajout, sous la ligne du haut : « Add a station » (#3402), qui ouvre le même choix que « Choose who cooks it ».
    assert.deepEqual(top(vue).dessous("button").filter(({ className }) => className !== "aide").map(({ textContent }) => textContent), [ADD]);
    // L'en-tête du projet ne redit pas, au-dessus de l'onglet, qui le cuit.
    assert.equal(vue.element("stations-du-projet").hidden, true);
  });

  test("chaque carte : ce qu'elle est, son état, ce qu'elle tient, ses deux gestes, et « Details » replié", async () => {
    const vue = await thePage([BOX, MAC], seenOf(ON_THE_BOX));
    const [box] = cards(vue);
    assert.ok(box);
    assert.match(box.textContent, /always-on box: cooks while your computer sleeps/);
    assert.match(box.textContent, /online/);
    assert.match(box.textContent, /idle/);
    for (const action of [DISPLACE, STOP]) button(box, action);
    const details = box.dessous("details")[0] ?? assert.fail("pas de « Details »");
    assert.equal((details as unknown as { open?: boolean }).open, false);
    assert.equal(details.dessous("summary")[0]?.textContent.startsWith(DETAILS), true);
    // La connexion à Claude de la box se lit dans « Details », et nulle part ailleurs.
    assert.match(details.textContent, /Claude connection/);
    assert.equal(box.children.filter((child) => child !== details).some(({ textContent }) => textContent.includes("Claude connection")), false);
  });

  test("aucune station ne le sert : « No station cooks this project » et un seul bouton, qui ouvre le choix — cet ordinateur d'abord", async () => {
    const vue = await thePage([{ ...BOX, projets: [] }, MAC], seenOf({ ...ON_THE_BOX, suiviPar: undefined, cuitSur: null, stations: [] }));
    assert.equal(sentence(vue), NOBODY);
    assert.notEqual(top(vue).dataset.ton, "vert");
    assert.deepEqual(cards(vue), []);
    assert.deepEqual(top(vue).dessous("button").map(({ textContent }) => textContent), [CHOOSE]);
  });

  test("la box hors ligne : elle le cuit, mais rien ne cuit ; « Move to this computer », d'un clic, le déménage ici", async () => {
    const vue = await thePage([{ ...BOX, etat: "hors-ligne", dit: "offline for 3 h" }, MAC], seenOf(ON_THE_BOX));
    assert.equal(sentence(vue), "parade-box cooks this project, but it is offline for 3 h: nothing cooks");
    assert.equal(top(vue).dataset.ton, "rouge");
    // Comment la ramener, au survol de la ligne.
    assert.match(top(vue).dessous("button").find(({ className }) => className === "aide")?.ariaLabel ?? "", /switch parade-box on, or start its brigade-station service there/);
    button(top(vue), TO_HERE).click();
    await repos();
    assert.deepEqual(vue.dernier("demenagerLaCuisine"), ["parade", "gmac"]);
  });
});

describe("« Move to another station » : le choix, puis la ligne du haut suit le déménagement (#3195)", () => {
  test("cet ordinateur d'abord ; choisi, « Moving from A to B: waiting for … » depuis le clic ; passée la minute, ce qui le bloque ; fini, « Cooked by B »", async (t) => {
    const departure = Date.parse("2026-11-11T10:05:00.000Z");
    t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: departure });
    const vue = await thePage([BOX, MAC], seenOf(ON_THE_BOX));
    const [box] = cards(vue);
    button(box ?? assert.fail(), DISPLACE).click();
    await repos();
    const choice = tab(vue).dessous("section").find(({ className }) => className === "choix-des-stations") ?? assert.fail("pas de choix");
    assert.deepEqual(choice.dessous("li").map(({ dataset }) => dataset.choix), ["gmac"]);
    assert.equal(choice.dessous("li")[0]?.dessous("button")[0]?.textContent, "this computer");
    choice.dessous("li")[0]?.dessous("button")[0]?.click();
    await repos();
    await repos();
    assert.deepEqual(vue.dernier("demenagerLaCuisine"), ["parade", "gmac"]);
    assert.equal(sentence(vue), "Moving from parade-box to macbook: waiting for macbook to take the kitchen over, since 10:05 UTC");
    assert.equal(top(vue).dataset.ton, "jaune");
    // La station visée a sa carte, qui démarre ; aucune phrase « kitchen moves to » ne double la ligne du haut.
    assert.deepEqual(cards(vue).map(({ ariaLabel }) => ariaLabel), ["macbook", "parade-box"]);
    assert.equal(tab(vue).textContent.includes("moves to"), false);

    // Une minute passe, rien n'est publié : la ligne dit ce qui le bloque.
    t.mock.timers.tick(60_000);
    await repos();
    assert.match(top(vue).textContent, /Not done after a minute: macbook has not answered for 1 min/);

    // Les stations publient la fin : le Mac le sert, la box plus.
    vue.dire("surStations", { a: A, stations: [{ ...BOX, projets: [] }, { ...MAC, projets: ["parade"] }] });
    vue.dire("surProjetsDesStations", seenOf({ ...ON_THE_BOX, cuitSur: { id: "gmac", nom: "macbook", ici: true } }));
    await repos();
    assert.equal(sentence(vue), "Cooked by macbook · online · idle, nothing on the rail");
    assert.equal(top(vue).dataset.ton, "vert");
    assert.deepEqual(cards(vue).map(({ ariaLabel }) => ariaLabel), ["macbook"]);
  });

  test("refusé par le runtime : la ligne du haut reste la même, la raison se dit en une ligne", async () => {
    const vue = await thePage([BOX, MAC], seenOf(ON_THE_BOX), () => ({ refus: "this computer has no sandbox", detail: "sandbox-exec missing" }));
    button(cards(vue)[0] ?? assert.fail(), DISPLACE).click();
    await repos();
    tab(vue).dessous("li")[0]?.dessous("button")[0]?.click();
    await repos();
    await repos();
    assert.equal(sentence(vue), "Cooked by parade-box · online · idle, nothing on the rail");
    assert.match(tab(vue).textContent, /parade stays on parade-box: this computer has no sandbox/);
  });
});
