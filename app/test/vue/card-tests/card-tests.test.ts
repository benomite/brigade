// Sur la fiche d'un ticket, pour chaque critère d'acceptation, son test et son chemin : rouge sur main, vert sur la branche,
// N mutations survécues (#3728). Une étape que l'enregistrement ne donne pas est pending, jamais done ; le renvoi de la pass
// se lit sur la fiche. Le module est joué devant un faux document, puis la vue telle qu'elle est (helpers/false-vue.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { POWER_UP } from "../../../src/power-up.ts";
import { forTheBar } from "../../../src/bar.ts";
import { EXAMPLE } from "../../../src/config.ts";
import { PALETTE } from "../../../src/colors.ts";
import { KITCHEN_ACTIONS } from "../../../src/kitchen.ts";
import { BANNER, holdFacts } from "../../../src/facts.ts";
import { CONFIRMED, DIRECT } from "../../../src/actions.ts";
import { TABS, HEADINGS } from "../../../src/tabs.ts";
import { EFFORTS, MODELS } from "../../../src/projects/projects.ts";
import type { Terminal } from "../../../src/terminals.ts";
import { setTestsOfCard } from "../../../src/vue/card-tests/card-tests.js";
import { cardOfTicket, Fake, playTheVue, repos } from "../../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) };

// Trois critères : un qui a tout passé, un dont une mutation a survécu, un dont l'enregistrement est vide.
const FIXTURE = {
  sendBack: "a frozen acceptance test was modified",
  criteria: [
    { criterion: "The journal is append-only", testPath: "app/test/journal.test.ts", redOnMain: true, greenOnBranch: true, mutationsCaught: 5, mutationsTotal: 5, survivingLines: [] },
    { criterion: "A guard stops a ticket twice", testPath: "app/test/garde.test.ts", redOnMain: true, greenOnBranch: true, mutationsCaught: 3, mutationsTotal: 5, survivingLines: ["app/src/garde.ts:41 — `kills.length >= 2` -> `kills.length >= 3`", "app/src/garde.ts:58 — `return` removed"] },
    { criterion: "The sheet shows the pass's verdict", testPath: "app/test/verdict.test.ts" },
  ],
};

const section = () => (setTestsOfCard(doc, FIXTURE)[0] as Fake | undefined) ?? assert.fail("pas de section");
const lines = (root: Fake) => root.dessous("li").filter(({ className }) => className === "critere-teste");
const steps = (line: Fake) => (line.dessous("ol").find(({ className }) => className === "critere-etapes") ?? assert.fail("pas d'étapes")).children as Fake[];

// Les étapes d'un critère, lues par la section que la fiche pose.
const statesOf = (recording: object) => {
  const [line] = lines(setTestsOfCard(doc, { criteria: [recording] })[0] as Fake);
  return steps(line ?? assert.fail("pas de ligne")).map((e) => e.dataset.etat);
};

describe("les étapes d'un critère", () => {
  test("rouge sur main, vert sur la branche, puis N = total − attrapées mutations survécues, avec le total", () => {
    const [, rate] = lines(section());
    assert.deepEqual(steps(rate ?? assert.fail("")).map((e) => [e.dataset.etat, e.dessous("span").at(-1)?.textContent]), [["done", "red on main"], ["done", "green on the branch"], ["failed", "survived 2 of 5 mutations"]]);
    assert.deepEqual(statesOf({ redOnMain: false, greenOnBranch: false, mutationsCaught: 4, mutationsTotal: 4 }), ["failed", "failed", "done"]);
  });

  test("un champ qui manque ou qui ne se lit pas est pending, jamais done", () => {
    assert.deepEqual(statesOf({}), ["pending", "pending", "pending"]);
    for (const badly of [{ mutationsTotal: 5 }, { mutationsCaught: 5 }, { mutationsCaught: 0, mutationsTotal: 0 }, { mutationsCaught: 6, mutationsTotal: 5 }, { mutationsCaught: -1, mutationsTotal: 5 }, { mutationsCaught: "5", mutationsTotal: 5 }, { redOnMain: "yes", greenOnBranch: 1 }]) {
      assert.deepEqual(statesOf(badly), ["pending", "pending", "pending"], JSON.stringify(badly));
    }
  });
});

describe("la section de la fiche", () => {
  test("trois critères : trois lignes, chacune son texte et le chemin de son test", () => {
    const ranks = lines(section());
    assert.equal(ranks.length, 3);
    assert.deepEqual(ranks.map((rank) => rank.dessous("p")[0]?.textContent), FIXTURE.criteria.map(({ criterion }) => criterion));
    assert.deepEqual(ranks.map((rank) => rank.dessous("code")[0]?.textContent), FIXTURE.criteria.map(({ testPath }) => testPath));
  });

  test("chaque ligne dit ses trois étapes dans l'ordre, chacune dans son état ; le marqueur a une forme par état", () => {
    const [finished, rate, empty] = lines(section());
    assert.deepEqual(steps(finished ?? assert.fail("")).map((e) => [e.dataset.etat, e.dessous("span").at(-1)?.textContent]), [["done", "red on main"], ["done", "green on the branch"], ["done", "survived 0 of 5 mutations"]]);
    assert.deepEqual(steps(rate ?? assert.fail("")).map((e) => [e.dataset.etat, e.dessous("span").at(-1)?.textContent]), [["done", "red on main"], ["done", "green on the branch"], ["failed", "survived 2 of 5 mutations"]]);
    assert.deepEqual(steps(empty ?? assert.fail("")).map((e) => [e.dataset.etat, e.dessous("span").at(-1)?.textContent]), [["pending", "red on main"], ["pending", "green on the branch"], ["pending", "survived ? mutations"]]);
    const shapes = ["done", "failed", "pending"].map((state) => steps(lines(section())[state === "done" ? 0 : state === "failed" ? 1 : 2] ?? assert.fail("")).at(-1)?.dessous("span")[0]?.dataset.forme);
    assert.deepEqual(shapes, ["disque", "carre", "anneau"]);
  });

  test("une mutation survivante est dite avec sa ligne ; un critère sans mutation survivante n'en dit aucune", () => {
    const [finished, rate, empty] = lines(section());
    assert.deepEqual((rate ?? assert.fail("")).dessous("code").slice(1).map(({ textContent }) => textContent), FIXTURE.criteria[1]?.survivingLines);
    assert.equal((finished ?? assert.fail("")).dessous("code").length, 1);
    assert.equal((empty ?? assert.fail("")).dessous("code").length, 1);
    const withoutLine = setTestsOfCard(doc, { criteria: [{ criterion: "x", testPath: "t", redOnMain: true, greenOnBranch: true, mutationsCaught: 0, mutationsTotal: 2 }] })[0] as Fake;
    assert.equal(withoutLine.dessous("code").at(-1)?.textContent, "no surviving line given");
  });

  test("le renvoi de la pass est dit en tête quand la fiche en porte un, et nulle part sinon", () => {
    const withIt = section();
    assert.equal(withIt.children[0]?.textContent, "Sent back: a frozen acceptance test was modified");
    const without = setTestsOfCard(doc, { criteria: FIXTURE.criteria })[0] as Fake;
    assert.equal(without.dessous("p").some(({ className }) => className === "renvoi"), false);
  });

  test("sans enregistrement, rien ; une liste de critères illisible se dit en une ligne, sans critère inventé", () => {
    assert.deepEqual(setTestsOfCard(doc, undefined), []);
    assert.deepEqual(setTestsOfCard(doc, null), []);
    const unreadable = setTestsOfCard(doc, { criteria: "three" })[0] as Fake;
    assert.equal(unreadable.textContent, "The criteria and their tests not reached.");
    assert.equal(lines(unreadable).length, 0);
  });
});

describe("la fiche dans la vue", () => {
  const A = "2026-10-13T10:04:12.000Z";
  const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "second · claude", note: "", arrete: false };
  const FACTS = {
    etat: "ouverte",
    lu: "2026-10-13T10:04:11.000Z",
    dernierTick: "2026-10-13T10:04:02.000Z",
    compteurs: { rail: 1, auTravail: 1, aLaPass: 0, attend: 0, livres24h: 0 },
    dernierEvenement: null,
    rail: [{ ticket: 14, etat: "pris", titre: "Le journal en ajout seul", url: "https://github.com/benomite/brigade/issues/14", activite: null }],
    cooks: [],
    attend: [],
  };

  test("la fiche d'un ticket dont la carte porte les enregistrements les pose ; une fiche sans enregistrement n'en pose pas", async () => {
    const startup = () => ({
      configuration: forTheBar({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade" }] }, () => true),
      palette: PALETTE,
      exemple: EXAMPLE,
      onglets: TABS, rubriques: HEADINGS,
      gestes: { allumage: POWER_UP, cuisine: KITCHEN_ACTIONS, directs: DIRECT, confirmes: CONFIRMED },
      banniere: BANNER,
      calibrage: { modeles: MODELS, efforts: EFFORTS },
      code: undefined,
    });
    const vue = await playTheVue({ demarrage: startup, espace: () => [SECOND], machines: () => [{ id: "poste", titre: "this computer" }] });
    (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
    await repos();
    const receivedOne = holdFacts(() => new Map()).recevoir({ projet: "parade", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(FACTS) }] });
    vue.dire("surFaits", { ...receivedOne, demande: vue.dernier("faits")[0] as number });
    await repos();
    (cardOfTicket(vue, 14) ?? assert.fail("pas de bon #14")).click();
    await repos();
    assert.equal(vue.element("fiche").dessous("section").some(({ className }) => className === "tests-de-fiche"), false);
    vue.element("fiche").children[0]?.dessous("button").find(({ className }) => className === "fermer")?.click();
    await repos();
    const withIt = JSON.parse(JSON.stringify(receivedOne), (key, value) => (value !== null && typeof value === "object" && value.ticket === 14 && "fiche" in value ? { ...value, tests: FIXTURE } : value));
    vue.dire("surFaits", { ...withIt, demande: vue.dernier("faits")[0] as number });
    await repos();
    (cardOfTicket(vue, 14) ?? assert.fail("pas de bon #14")).click();
    await repos();
    const setOne = vue.element("fiche").dessous("section").find(({ className }) => className === "tests-de-fiche") ?? assert.fail("pas de section sur la fiche");
    assert.equal(lines(setOne).length, 3);
    assert.match(setOne.textContent, /Sent back: a frozen acceptance test was modified/);
  });
});
