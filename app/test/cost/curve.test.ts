// La courbe de la page des coûts de l'app (vue/cost/curve.js, #909, #1022) : sous les trois chiffres de tête, les tokens
// lancés chaque jour, une série par projet, une légende qui nomme chaque projet, et « not
// communicated » à la place du tracé quand la box ne donne pas la série. Le module est lu seul,
// puis la vue jouée telle qu'elle est (helpers/false-vue.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { POWER_UP } from "../../src/power-up.ts";
import { forTheBar } from "../../src/bar.ts";
import { EXAMPLE, type Project } from "../../src/config.ts";
import { PALETTE } from "../../src/colors.ts";
import { KITCHEN_ACTIONS } from "../../src/kitchen.ts";
import { BANNER } from "../../src/facts.ts";
import { CONFIRMED, DIRECT } from "../../src/actions.ts";
import { EFFORTS, MODELS } from "../../src/projects/projects.ts";
import { TABS, HEADINGS } from "../../src/tabs.ts";
import { DAYS, daysOf, setCurve, series, TITLE } from "../../src/vue/cost/curve.js";
import { windowsOf, READING, NOT_COMMUNICATED } from "../../src/vue/cost/head.js";
import { Fake, type Played, playTheVue, openTheCosts, repos } from "../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise), createElementNS: (_space: string, balise: string) => new Fake(balise) };
const A = "2026-10-17T10:00:00.000Z";
// Un nombre tel que le runtime l'écrit (fr-FR) : séparé d'espaces fines insécables.
const n = (figures: string) => figures.replaceAll(" ", " ");

// Ce que `station` rend aujourd'hui (runtime/src/montrer-station.ts) : le bloc `consommé`, en cours, 5 h
// et 24 h — et, quand la box communique ses jours, une ligne par jour dans le même bloc.
const station = (days: string[] = []) =>
  [
    "station               box/claude — moteur claude, fournit : claude",
    "cooks en cours        aucun",
    `consommé              en cours : 1 lancement · 4 tours · ${n("12 000")} tokens`,
    `                      5 h : 1 lancement · 3 tours · ${n("320 000")} tokens`,
    "                      24 h : rien",
    ...days.map((day) => `                      ${day}`),
    "                      ce que ce projet a lancé, pas la consommation du compte : /usage la donne",
    "décisions du chef     `station -- <geste> <valeur>` pour en poser une",
    "  seuil-ticket        non posée — 2026-10-01 : 9 tokens n'est pas un jour du bloc",
  ].join("\n");
const readOne = (project: string, text: string) => ({ projet: project, demande: 0, a: A, sorties: [{ commande: "station", texte: text }] });
const unreachable = (project: string) => ({ projet: project, demande: 0, a: A, erreur: "connection refused", atteinte: false, cas: null });

const PARADE_DAYS = station([`2026-10-14 : 6 lancements · 214 tours · ${n("1 284 530")} tokens`, "2026-10-15 : rien", `2026-10-16 : 19 lancements, dont 5 relectures · 802 tours · ${n("4 912 044")} tokens`]);
const CANTINE_DAYS = station([`2026-10-15 : 1 lancement · 1 tour · 1 token`, `2026-10-16 : 2 lancements · 61 tours · ${n("318 772")} tokens`]);

describe("ce que `station` dit de chaque jour", () => {
  test("une ligne par jour du bloc `consommé`, par date — « rien » vaut zéro, un token seul se lit", () => {
    assert.deepEqual([...daysOf(PARADE_DAYS)], [
      ["2026-10-14", 1_284_530],
      ["2026-10-15", 0],
      ["2026-10-16", 4_912_044],
    ]);
    assert.deepEqual([...daysOf(CANTINE_DAYS)], [
      ["2026-10-15", 1],
      ["2026-10-16", 318_772],
    ]);
  });

  test("ni les fenêtres, ni ce qui suit le bloc ne sont des jours — et les jours ne sont pas des fenêtres", () => {
    assert.equal(daysOf(station()).size, 0);
    assert.deepEqual([...windowsOf(PARADE_DAYS)], [
      [5, 320_000],
      [24, 0],
    ]);
  });
});

describe("les séries par projet", () => {
  const projects = [{ nom: "parade", teinte: "#f2994a" }, { nom: "cantine" }];

  test("une série par projet, alignées sur les mêmes jours, du plus ancien au plus récent ; un jour qu'un projet ne dit pas est un trou", () => {
    assert.deepEqual(series(projects, new Map([["cantine", readOne("cantine", CANTINE_DAYS)], ["parade", readOne("parade", PARADE_DAYS)]])), {
      jours: ["2026-10-14", "2026-10-15", "2026-10-16"],
      series: [
        { projet: { nom: "parade", teinte: "#f2994a" }, points: [1_284_530, 0, 4_912_044] },
        { projet: { nom: "cantine" }, points: [null, 1, 318_772] },
      ],
    });
  });

  test("une box qui ne dit pas ses jours, ou injoignable, ne communique pas sa série ; une box pas encore lue est en lecture", () => {
    const readEntries = new Map<string, unknown>([["parade", readOne("parade", station())], ["cantine", unreachable("cantine")]]);
    assert.deepEqual(series(projects, readEntries as never), { jours: [], series: [{ projet: projects[0], points: null }, { projet: projects[1], points: null }] });
    assert.deepEqual(series(projects, new Map([["parade", readOne("parade", PARADE_DAYS)]])).series.map(({ points }) => points), [[1_284_530, 0, 4_912_044], undefined]);
  });

  test(`les ${DAYS} derniers jours, au plus`, () => {
    const days = Array.from({ length: 20 }, (_, i) => `2026-09-${String(i + 1).padStart(2, "0")} : ${i + 1} tokens`);
    const { jours: shown, series: [parade] } = series([{ nom: "parade" }], new Map([["parade", readOne("parade", station(days))]]));
    assert.equal(shown.length, DAYS);
    assert.equal(shown[0], "2026-09-07");
    assert.equal(shown.at(-1), "2026-09-20");
    assert.deepEqual(parade?.points?.slice(0, 2), [7, 8]);
  });
});

describe("la courbe posée", () => {
  const projects = [{ nom: "parade", teinte: "#f2994a" }, { nom: "cantine" }];
  const set = (readings: Map<string, unknown>) => setCurve(doc, projects, readings as never) as Fake;
  const legend = (pose: Fake) => pose.dessous("li").map((line) => line.children.slice(1).map(({ textContent }) => textContent));

  test("un titre court, une ligne par projet dans le tracé, à la teinte de sa pastille, et une légende qui nomme chacun", () => {
    const pose = set(new Map([["parade", readOne("parade", PARADE_DAYS)], ["cantine", readOne("cantine", CANTINE_DAYS)]]));
    assert.equal(pose.dessous("h2")[0]?.textContent, TITLE);
    const [svg] = pose.dessous("svg");
    assert.ok(svg !== undefined);
    // Deux tracés par série : sa ligne et ses points.
    const traces = svg.dessous("path");
    assert.equal(traces.length, 4);
    assert.equal(traces[0]?.style.getPropertyValue("--teinte"), "#f2994a");
    // parade : trois jours dits, d'un seul tenant, le plus haut au sommet ; cantine commence au deuxième jour.
    // Le repère fait 1000 × 100 ; le plus haut, 4 912 044, en touche le haut.
    const y = (tokens: number) => 100 - (tokens / 4_912_044) * 100;
    assert.equal(traces[0]?.getAttribute("d"), `M0 ${y(1_284_530)}L500 100L1000 0`);
    assert.equal(traces[1]?.getAttribute("d"), `M0 ${y(1_284_530)}h0M500 100h0M1000 0h0`);
    assert.equal(traces[2]?.getAttribute("d"), `M500 ${y(1)}L1000 ${y(318_772)}`);
    assert.deepEqual(pose.dessous("span").filter(({ className }) => className === "haut").map(({ textContent }) => textContent), ["4.9M"]);
    // Chaque jour sous son point.
    const days = pose.dessous("div").find(({ className }) => className === "jours")?.children ?? [];
    assert.deepEqual(days.map(({ textContent }) => textContent), ["Oct 14", "Oct 15", "Oct 16"]);
    assert.deepEqual(days.map(({ style }) => style.getPropertyValue("left")), ["0%", "50%", "100%"]);
    assert.deepEqual(legend(pose), [["parade"], ["cantine"]]);
    assert.equal(pose.dessous("li")[0]?.children[0]?.style.getPropertyValue("--teinte"), "#f2994a");
    // Ce que chaque projet a lancé un jour se lit au survol de sa colonne, pas à plat.
    assert.deepEqual(svg.dessous("title").map(({ textContent }) => textContent), ["Oct 14 — parade 1,284,530 · cantine not communicated", "Oct 15 — parade 0 · cantine 1", "Oct 16 — parade 4,912,044 · cantine 318,772"]);
  });

  test("un trou coupe la ligne ; un jour seul entre deux trous reste un point", () => {
    const pose = set(new Map([["parade", readOne("parade", station(["2026-10-12 : 10 tokens", "2026-10-14 : 20 tokens", "2026-10-15 : 20 tokens"]))], ["cantine", readOne("cantine", station(["2026-10-13 : 20 tokens"]))]]));
    const [line, points, lineCantine, pointsCantine] = pose.dessous("path");
    assert.equal(line?.getAttribute("d"), "M666.6666666666666 0L1000 0");
    assert.equal(points?.getAttribute("d"), "M0 50h0M666.6666666666666 0h0M1000 0h0");
    assert.equal(lineCantine?.getAttribute("d"), "");
    assert.equal(pointsCantine?.getAttribute("d"), "M333.3333333333333 0h0");
  });

  test("une série que la box ne communique pas : le tracé reste celui des autres, la légende le dit sous le nom", () => {
    const pose = set(new Map<string, unknown>([["parade", readOne("parade", PARADE_DAYS)], ["cantine", unreachable("cantine")]]));
    assert.equal(pose.dessous("path").length, 2);
    assert.deepEqual(legend(pose), [["parade"], ["cantine", NOT_COMMUNICATED]]);
    assert.doesNotMatch(pose.textContent, /refused/);
  });

  test("aucune box ne communique sa série : la zone dit « not communicated », et rien n'est tracé", () => {
    for (const readings of [new Map([["parade", readOne("parade", station())], ["cantine", readOne("cantine", station())]]), new Map<string, unknown>([["parade", unreachable("parade")], ["cantine", readOne("cantine", station())]])]) {
      const pose = set(readings);
      assert.deepEqual(pose.children.map(({ balise, textContent }) => [balise, textContent]), [["h2", TITLE], ["p", NOT_COMMUNICATED]]);
      assert.equal(pose.dessous("svg").length, 0);
    }
    // Avant toute lecture, la zone est en lecture — pas « not communicated ».
    assert.equal(set(new Map()).children[1]?.textContent, READING);
    assert.equal(set(new Map([["parade", readOne("parade", station())]])).children[1]?.textContent, READING);
  });

  test("aucune phrase d'explication : rien de posé à plat ne dépasse quelques mots", () => {
    const pose = set(new Map<string, unknown>([["parade", readOne("parade", PARADE_DAYS)], ["cantine", unreachable("cantine")]]));
    for (const element of pose.descendants()) {
      if (element.children.length > 0 || element.balise === "title") continue;
      assert.ok(element.textContent.split(/\s+/).length <= 4, `trop long pour un libellé : « ${element.textContent} »`);
    }
  });
});

describe("la courbe, sur la page des coûts de l'app", () => {
  const PARADE: Project = { nom: "parade", dossier: "/tmp/parade", couleurs: { onglet: "#f2994a", accent: "#f2994a" } };
  const CANTINE: Project = { nom: "cantine", dossier: "/tmp/cantine" };

  async function openThePage(): Promise<Played> {
    const vue = await playTheVue({
      demarrage: () => ({
        configuration: forTheBar({ chemin: "/tmp/app.json", projets: [PARADE, CANTINE] }, () => true),
        palette: PALETTE,
        exemple: EXAMPLE,
        onglets: TABS,
        rubriques: HEADINGS,
        gestes: { allumage: POWER_UP, cuisine: KITCHEN_ACTIONS, directs: DIRECT, confirmes: CONFIRMED },
        banniere: BANNER,
        calibrage: { modeles: MODELS, efforts: EFFORTS },
        code: undefined,
      }),
      espace: () => [],
    });
    await openTheCosts(vue);
    return vue;
  }
  const curve = (vue: Played) => vue.element("cout").dessous("div").find(({ className }) => className === "courbe-cout") ?? assert.fail("pas de courbe");

  test("sous les chiffres de tête, la courbe lit `station` de chaque box ; sans jours, sa zone dit « not communicated »", async () => {
    const vue = await openThePage();
    const blocks = vue.element("cout").children.at(-1) ?? assert.fail("pas de blocs");
    assert.deepEqual(blocks.children.map(({ className }) => className), ["tete-cout", "chiffres-autonomie", "perdus-cout", "chers-cout", "courbe-cout"]);
    assert.equal(curve(vue).dessous("p")[0]?.textContent, READING);
    const request = vue.dernier("onglet")[2] as number;

    vue.dire("surContenu", { ...readOne("parade", station()), demande: request }, undefined);
    vue.dire("surContenu", { ...readOne("cantine", station()), demande: request }, undefined);
    await repos();
    assert.equal(curve(vue).dessous("p")[0]?.textContent, NOT_COMMUNICATED);
    assert.equal(curve(vue).dessous("svg").length, 0);

    vue.dire("surContenu", { ...readOne("parade", PARADE_DAYS), demande: request }, undefined);
    vue.dire("surContenu", { ...readOne("cantine", CANTINE_DAYS), demande: request }, undefined);
    await repos();
    assert.equal(curve(vue).dessous("path").length, 4);
    assert.deepEqual(curve(vue).dessous("li").map(({ textContent }) => textContent), ["parade", "cantine"]);
  });
});
