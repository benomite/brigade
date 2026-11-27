// Le temps de la pass sur 7 jours (#3512), dans la section de Settings du projet, à côté de ses chiffres d'autonomie :
// tel que la station le publie (`passe`, runtime/src/temps-ticket/passe.ts), jamais recalculé. Le bloc est joué avec le
// faux élément de l'app ; la vue entière, contre le faux pont (helpers/false-vue.ts), une station qui le publie.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Home } from "../../../src/home.ts";
import { POWER_UP } from "../../../src/power-up.ts";
import { forTheBar } from "../../../src/bar.ts";
import { EXAMPLE, type Project } from "../../../src/config.ts";
import { PALETTE } from "../../../src/colors.ts";
import { KITCHEN_ACTIONS } from "../../../src/kitchen.ts";
import { BANNER } from "../../../src/facts.ts";
import { CONFIRMED, DIRECT } from "../../../src/actions.ts";
import { TABS, HEADINGS } from "../../../src/tabs.ts";
import { calibrationRecommended, EFFORTS, machineProposed, MODELS, type ProjectSeen, type SeenOfProjects } from "../../../src/projects/projects.ts";
import type { Outage } from "../../../src/outages/outages.ts";
import type { SeenOfStations } from "../../../src/stations/stations.ts";
import { setBlockTimeOfThePass } from "../../../src/vue/project/banner-health/PassTime.js";
import { Fake, playTheVue, openRead, repos } from "../../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) };

const part = (key: string, name: string, deliveries: number, medianS: number | null, p75S: number | null, totalS: number) => ({ cle: key, nom: name, livraisons: deliveries, medianeS: medianS, p75S, totalS, partPct: null });
const PASS = {
  jours: 7,
  livraisons: 12,
  parts: [
    part("attente", "waiting for the pass", 12, 120, 300, 2400),
    part("gates", "gates", 12, 0, 0, 0),
    part("revue", "review", 12, 240, 420, 3600),
    part("ci", "CI", 12, 1500, 1800, 19_800),
    part("merge", "merge", 12, 10, 20, 150),
    part("ciAttente", "CI waiting for runners", 9, 1200, 1680, 16_200),
    part("ciCourse", "CI running", 9, 420, 540, 4000),
  ],
  phaseLaPlusLourde: { nom: "CI", totalS: 19_800 },
  partLaPlusLourde: { nom: "CI waiting for runners", partPct: 62 },
  relancees: 4,
  renvoyees: 2,
  passesRenvoyeesS: 1500,
};
const TIME = { enregistrements: [], lostTimeMaxMin: 2, passe: PASS };

const parClasse = (root: Fake, classe: string) => [...root.descendants()].filter((pose) => pose.className.split(" ").includes(classe));
const textOf = (root: Fake, classe: string) => parClasse(root, classe).map(({ textContent }) => textContent);
// Chaque rangée : son nom, puis ce qu'elle dit.
const rows = (block: Fake) => block.dessous("li").map((li) => [textOf(li, "nom")[0], textOf(li, "valeur")[0]]);

describe("le temps de la pass, dans Settings", () => {
  test("en une ligne, la part qui pèse le plus sur le temps de pass de la semaine ; chaque phase et chaque part de la CI, sa médiane et son p75", () => {
    const block = setBlockTimeOfThePass(doc, TIME);
    assert.equal(block.dataset.bloc, "temps-de-la-passe");
    assert.deepEqual(textOf(block, "plus-lourde"), ["CI waiting for runners: 62% of pass time · last 7 days, 12 deliveries, each of their passes counted"]);
    assert.deepEqual(rows(block), [
      ["Waiting for the pass", "median 2 min · p75 5 min"],
      ["Gates", "none"],
      ["Review", "median 4 min · p75 7 min"],
      ["CI", "median 25 min · p75 30 min"],
      ["Merge", "median 10 s · p75 20 s"],
      ["CI waiting for runners", "median 20 min · p75 28 min"],
      ["CI running", "median 7 min · p75 9 min"],
    ]);
    assert.deepEqual(textOf(block, "note"), ["Heaviest stage in total: CI, 5 h 30 min.", "CI runs restarted because the branch moved: 4.", "Sent back: 2 deliveries, 25 min in the passes sent back."]);
  });

  test("une mesure qui manque se dit « no measure yet », jamais zéro", () => {
    const withoutCi = { ...PASS, parts: PASS.parts.map((p) => (p.cle === "ciAttente" || p.cle === "ciCourse" ? { ...p, livraisons: 0, medianeS: null, p75S: null, totalS: 0 } : p)), relancees: null, renvoyees: 0 };
    const block = setBlockTimeOfThePass(doc, { ...TIME, passe: withoutCi });
    assert.deepEqual(rows(block).slice(5), [
      ["CI waiting for runners", "No measure yet."],
      ["CI running", "No measure yet."],
    ]);
    assert.deepEqual(textOf(block, "note").slice(1), ["CI runs restarted because the branch moved: no measure yet.", "No delivery sent back."]);
    assert.doesNotMatch(block.textContent, /median 0|moved: 0/);
  });

  test("sans temps de la pass publié ou lisible : « no measure yet », aucune phase ni aucun zéro — le même temps lisible les pose", () => {
    // Le témoin : le temps de la pass lisible pose ses phases — sans lui, ce test ne prouverait rien.
    assert.equal(rows(setBlockTimeOfThePass(doc, TIME)).length, 7);
    for (const time of [undefined, { enregistrements: [] }, { passe: null }, { passe: { ...PASS, livraisons: 0 } }, { passe: { ...PASS, partLaPlusLourde: null } }, { passe: "x" }]) {
      const block = setBlockTimeOfThePass(doc, time);
      assert.deepEqual(textOf(block, "sans-mesure"), ["No measure yet. No delivery merged in the last 7 days has its pass measured."], JSON.stringify(time));
      assert.deepEqual(rows(block), []);
      assert.doesNotMatch(block.textContent, /\b0\b/);
    }
  });
});

describe("dans la vue, ce que la station publie", () => {
  const A = "2026-10-22T12:00:00.000Z";
  const BOX = { id: "g1", nom: "box", machine: "Linux 6.1.0", coeurs: 8, etat: "en-ligne", ligne: "online · version 1.4.0 · no project", pannes: [] as Outage[], dit: "online", version: "1.4.0", projets: [] as string[], max: null } as const;
  const HOME: Home = { projets: [], stations: [], sante: { ton: "vert", dit: "Max ✓  ·  GitHub ✓", survol: "" } };
  const PARADE: Project = { nom: "parade", dossier: "/tmp/parade", depot: "benomite/parade", base: "main" };
  const projects = (time: object): SeenOfProjects => {
    const project = {
      nom: "parade",
      depot: "benomite/parade",
      base: "main",
      suiviPar: { id: "g1", nom: "box" },
      stations: [{ id: "g1", nom: "box", etat: "en-preparation", dit: "", autoriser: [] }],
      servi: null,
      cuitSur: { id: "g1", nom: "box", ici: false },
      temps: time,
    } as ProjectSeen;
    return { a: A, projets: [project], recommandee: "g1", avertissements: {}, machines: { g1: machineProposed(BOX) }, calibrage: calibrationRecommended([]) };
  };
  const startup = () => ({
    configuration: forTheBar({ chemin: "/tmp/app.json", projets: [PARADE] }),
    palette: PALETTE,
    exemple: EXAMPLE,
    onglets: TABS,
    rubriques: HEADINGS,
    gestes: { allumage: POWER_UP, cuisine: KITCHEN_ACTIONS, directs: DIRECT, confirmes: CONFIRMED },
    banniere: BANNER,
    calibrage: { modeles: MODELS, efforts: EFFORTS },
    code: undefined,
    stations: { a: A, stations: [BOX] } satisfies SeenOfStations,
    accueil: HOME,
    projetsDesStations: projects(TIME),
  });

  test("le temps de la pass que la station publie se lit dans Settings, avant les chiffres d'autonomie", async () => {
    const vue = await playTheVue({ demarrage: startup, espace: () => [], autoriserSurGitHub: () => true });
    (vue.element("projets").children.at(1) ?? assert.fail("pas de case « parade »")).click();
    await repos();
    await openRead(vue, "Settings");
    const blocks = vue.element("bandeau-sante").children;
    const block = blocks.find(({ dataset }) => dataset.bloc === "temps-de-la-passe") ?? assert.fail("pas de temps de la pass");
    assert.equal(blocks[blocks.indexOf(block) + 1]?.dataset.bloc, "chiffres-autonomie");
    assert.deepEqual(textOf(block, "plus-lourde").map((t) => t.split(" · ")[0]), ["CI waiting for runners: 62% of pass time"]);
    assert.equal(rows(block).length, 7);
  });
});
