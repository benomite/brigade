// La page d'une station (ticket 2641, épique 2497) : la coque pose ses sections dans leur ordre, dit à une autre station
// de se montrer sans se régler, ne montre aucun réglage du projet ; vue.js la monte quand le chef ouvre une station ; et
// la marque du niveau d'un réglage dit chacun des trois niveaux par une étiquette à elle — celle que `niveauDe` pose.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { lineOfStation } from "../src/home.ts";
import { POWER_UP } from "../src/power-up.ts";
import { forTheBar } from "../src/bar.ts";
import { EXAMPLE } from "../src/config.ts";
import { PALETTE } from "../src/colors.ts";
import { KITCHEN_ACTIONS } from "../src/kitchen.ts";
import { BANNER } from "../src/facts.ts";
import { CONFIRMED, DIRECT } from "../src/actions.ts";
import { TABS, HEADINGS } from "../src/tabs.ts";
import { calibrationRecommended, EFFORTS, MODELS } from "../src/projects/projects.ts";
import type { StationVue } from "../src/stations/stations.ts";
import { LEVELS, LEVELS_SAID, levelOf } from "../src/vue/levels.js";
import { levelSetting } from "../src/vue/station/page/SettingLevel.js";
import { UNAVAILABLE, DELIVERED, NOT_STILL, setPageOfStation, SECTIONS } from "../src/vue/station/page/StationPage.js";
import { Fake, playTheVue, repos } from "./helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) };
const STATION = { id: "gist-mac", nom: "mac/claude" };
const TITLES = ["Identity", "Connections", "Folders and sandbox", "Capabilities", "Cooks", "Engine"];

type Context = { ici: boolean; lectureSeule: boolean; niveau(key: string): Fake };

// Un chargeur qui rend, pour chaque section, un élément qui dit ce qu'elle a reçu.
function witnesses(receivedOnes: Map<string, Context>) {
  return async (file: string) => ({
    setSection(fabrique: typeof doc, context: Context) {
      receivedOnes.set(file, context);
      const body = fabrique.createElement("p");
      body.append(context.niveau("cooks"));
      return body;
    },
  });
}

describe("la coque de la page d'une station", () => {
  test("celle de cet ordinateur pose les titres des sections dans l'ordre : identité, connexions, dossiers et bac à sable, capacités, cooks, moteur", async () => {
    const page = (await setPageOfStation(doc, { station: STATION, locale: "gist-mac" })) as Fake;
    assert.equal(page.dataset.ici, "true");
    assert.deepEqual(page.children.map((section) => section.children[0]?.textContent), TITLES);
    assert.deepEqual(page.children.map((section) => section.dataset.section), SECTIONS.map(({ fichier: file }) => file));
  });

  test("une section dont le fichier n'est pas livré garde son titre et dit qu'elle n'est pas encore là, sans rien charger", async () => {
    const requests: string[] = [];
    const page = (await setPageOfStation(doc, { station: STATION, locale: "gist-mac", charger: (file) => (requests.push(file), undefined) })) as Fake;
    for (const section of page.children) assert.equal(section.children[1]?.textContent, NOT_STILL);
    assert.equal(requests.length, SECTIONS.length);
    // Le chargeur par défaut ne demande que les fichiers livrés : aucun ne l'est encore, la page se pose sans en demander un absent.
    for (const file of DELIVERED) assert.ok(SECTIONS.some((section) => section.fichier === file), `${file} n'est pas une section`);
    const byDefault = (await setPageOfStation(doc, { station: STATION, locale: "gist-mac" })) as Fake;
    assert.equal(byDefault.children.filter((section) => section.children[1]?.textContent === NOT_STILL).length, SECTIONS.length - DELIVERED.size);
  });

  test("une section livrée qui ne se charge pas, ou qui lève, se dit indisponible — son détail au survol — et les autres se posent", async () => {
    const page = (await setPageOfStation(doc, {
      station: STATION,
      locale: "gist-mac",
      charger: async (file) => {
        if (file === "identite") throw new SyntaxError("Unexpected token");
        if (file === "connexions") return { setSection: () => { throw new Error("lecture ratée"); } };
        if (file === "capacites") return {};
        return witnesses(new Map())(file);
      },
    })) as Fake;
    const body = page.children.map((section) => section.children[1]);
    assert.deepEqual(body.map((line) => line?.className), ["indisponible", "indisponible", "", "indisponible", "", ""]);
    assert.equal(body[0]?.children[0]?.textContent, UNAVAILABLE);
    assert.equal(body[0]?.children[1]?.children[0]?.ariaLabel, "Unexpected token");
    assert.equal(body[1]?.children[1]?.children[0]?.ariaLabel, "lecture ratée");
    assert.equal(body[4]?.children[0]?.dataset.niveau, "machine");
  });

  test("la page d'une autre station passe `lectureSeule` à chaque section ; celle de cet ordinateur, non", async () => {
    const elsewhere = new Map<string, Context>();
    await setPageOfStation(doc, { station: { id: "gist-pc", nom: "pc/claude" }, locale: "gist-mac", charger: witnesses(elsewhere) });
    assert.deepEqual([...elsewhere.keys()], SECTIONS.map(({ fichier: file }) => file));
    for (const context of elsewhere.values()) assert.deepEqual([context.ici, context.lectureSeule], [false, true]);
    const here = new Map<string, Context>();
    await setPageOfStation(doc, { station: STATION, locale: "gist-mac", charger: witnesses(here) });
    for (const context of here.values()) assert.deepEqual([context.ici, context.lectureSeule], [true, false]);
  });

  test("sans station locale connue, aucune page n'est celle de cet ordinateur", async () => {
    for (const locale of [null, undefined, ""]) assert.equal(((await setPageOfStation(doc, { station: STATION, locale })) as Fake).dataset.ici, "false");
  });

  test("aucun réglage de niveau projet ne paraît : une section qui en demande un ne se rend pas, les autres si", async () => {
    const page = (await setPageOfStation(doc, { station: STATION, locale: "gist-mac", charger: witnesses(new Map()) })) as Fake;
    assert.deepEqual(page.children.map((section) => section.children[1]?.children[0]?.dataset.niveau), SECTIONS.map(() => "machine"));
    for (const key of Object.keys(LEVELS).filter((one) => LEVELS[one] === "project")) {
      const project = (file: string) => (file === "cooks" ? Promise.resolve({ setSection: (_: typeof doc, context: Context) => context.niveau(key) }) : witnesses(new Map())(file));
      const renderedOne = (await setPageOfStation(doc, { station: STATION, locale: "gist-mac", charger: project })) as Fake;
      assert.doesNotMatch(renderedOne.textContent, /\bproject\b(?! setting)/, `${key} : aucune marque « project »`);
      assert.ok(!renderedOne.descendants().some((element) => element.dataset.niveau === "project"), key);
      assert.match(renderedOne.children[4]?.children[1]?.children[1]?.children[0]?.ariaLabel ?? "", /belongs to the project/);
    }
  });
});

// L'app jouée : la page d'une station ouverte depuis le bloc de la station de l'accueil (#2638) monte la coque — celle de
// cet ordinateur par « Station settings », une autre par sa ligne sous « Your other stations ».
const A = "2026-11-06T12:00:00.000Z";
const MAC: StationVue = { id: "gist-mac", nom: "mac", machine: "macOS 25.0.0", etat: "en-ligne", ligne: "online", pannes: [], dit: "online", version: "1.4.0", projets: ["parade"], max: "connectee" };
const PC: StationVue = { ...MAC, id: "gist-pc", nom: "pc", machine: "Windows 11" };
const startup = () => ({
  configuration: forTheBar({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE,
  exemple: EXAMPLE,
  onglets: TABS,
  rubriques: HEADINGS,
  gestes: { allumage: POWER_UP, cuisine: KITCHEN_ACTIONS, directs: DIRECT, confirmes: CONFIRMED },
  banniere: BANNER,
  calibrage: { modeles: MODELS, efforts: EFFORTS },
  code: undefined,
  stations: { a: A, stations: [MAC, PC] },
  projetsDesStations: { a: A, projets: [], locale: "gist-mac", recommandee: null, avertissements: {}, machines: {}, calibrage: calibrationRecommended([]) },
  accueil: { projets: [], stations: [lineOfStation(MAC, 0), lineOfStation(PC, 0)], sante: { ton: "vert" as const, dit: "Max ✓  ·  GitHub ✓", survol: "" } },
});

async function openTheStation(name: string) {
  const vue = await playTheVue({ demarrage: startup, espace: () => [] });
  (vue.element("projets").children.at(0) ?? assert.fail("pas d'entrée « Tous les projets »")).click();
  await repos();
  const buttons = vue.element("accueil-bloc-station").dessous("button");
  const line =
    (name === "mac" ? buttons.find(({ textContent }) => textContent.startsWith("Station settings")) : buttons.find(({ className, textContent }) => className === "ligne" && textContent.startsWith(name))) ??
    assert.fail(`pas de bouton pour « ${name} »`);
  line.click();
  await repos();
  return vue.element("station").dessous("div").find(({ className }) => className === "page-de-station") ?? assert.fail("pas de sections sur la page");
}

describe("ouvrir une station dans l'app monte la coque", () => {
  test("la page de cet ordinateur pose ses sections dans l'ordre, et se sait ici", async () => {
    const shell = await openTheStation("mac");
    assert.equal(shell.dataset.ici, "true");
    assert.deepEqual(shell.children.map((section) => section.children[0]?.textContent), TITLES);
  });

  test("la page d'une autre station est en lecture seule", async () => {
    const shell = await openTheStation("pc");
    assert.equal(shell.dataset.ici, "false");
    assert.deepEqual(shell.children.map((section) => section.children[0]?.textContent), TITLES);
  });
});

describe("la marque du niveau d'un réglage", () => {
  test("chacun des trois niveaux a son étiquette, distincte, et son survol", () => {
    const marks = (["machine", "project", "you"] as const).map((level) => levelSetting(doc, level) as Fake);
    assert.deepEqual(marks.map(({ textContent }) => textContent), ["this computer", "project", "you"]);
    assert.equal(new Set(marks.map(({ textContent }) => textContent)).size, 3);
    for (const [i, level] of (["machine", "project", "you"] as const).entries()) {
      assert.equal(marks[i]?.className, "niveau");
      assert.equal(marks[i]?.dataset.niveau, level);
      assert.equal(marks[i]?.title, LEVELS_SAID[level].survol);
    }
  });

  test("`niveauDe` pose la même marque, à partir de la clé du réglage", () => {
    for (const [key, level] of Object.entries(LEVELS)) {
      const byKey = levelOf(doc, key) as Fake;
      const byLevel = levelSetting(doc, level) as Fake;
      assert.deepEqual([byKey.className, byKey.dataset, byKey.textContent, byKey.title], [byLevel.className, byLevel.dataset, byLevel.textContent, byLevel.title]);
    }
  });

  test("un niveau inconnu ne se rend pas", () => {
    assert.throws(() => levelSetting(doc, "ailleurs" as "you"), /unknown setting level/);
  });
});
