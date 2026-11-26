// Sur la fiche d'un ticket, pour chaque critère d'acceptation, son test et son chemin : rouge sur main, vert sur la branche,
// N mutations survécues (#3728). Une étape que l'enregistrement ne donne pas est pending, jamais done ; le renvoi de la pass
// se lit sur la fiche. Le module est joué devant un faux document, puis la vue telle qu'elle est (aides/fausse-vue.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../../../src/allumage.ts";
import { pourLaBar } from "../../../src/bar.ts";
import { EXEMPLE } from "../../../src/config.ts";
import { PALETTE } from "../../../src/couleurs.ts";
import { KITCHEN_ACTIONS } from "../../../src/kitchen.ts";
import { BANNIERE, holdFacts } from "../../../src/facts.ts";
import { CONFIRMES, DIRECTS } from "../../../src/actions.ts";
import { ONGLETS, RUBRIQUES } from "../../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../../src/projects/projects.ts";
import type { Terminal } from "../../../src/terminaux.ts";
import { poserTestsDeCard } from "../../../src/vue/card-tests/card-tests.js";
import { cardDuTicket, Faux, jouerLaVue, repos } from "../../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };

// Trois critères : un qui a tout passé, un dont une mutation a survécu, un dont l'enregistrement est vide.
const FIXTURE = {
  sendBack: "a frozen acceptance test was modified",
  criteria: [
    { criterion: "The journal is append-only", testPath: "app/test/journal.test.ts", redOnMain: true, greenOnBranch: true, mutationsCaught: 5, mutationsTotal: 5, survivingLines: [] },
    { criterion: "A guard stops a ticket twice", testPath: "app/test/garde.test.ts", redOnMain: true, greenOnBranch: true, mutationsCaught: 3, mutationsTotal: 5, survivingLines: ["app/src/garde.ts:41 — `kills.length >= 2` -> `kills.length >= 3`", "app/src/garde.ts:58 — `return` removed"] },
    { criterion: "The sheet shows the pass's verdict", testPath: "app/test/verdict.test.ts" },
  ],
};

const section = () => (poserTestsDeCard(doc, FIXTURE)[0] as Faux | undefined) ?? assert.fail("pas de section");
const lines = (racine: Faux) => racine.dessous("li").filter(({ className }) => className === "critere-teste");
const steps = (line: Faux) => (line.dessous("ol").find(({ className }) => className === "critere-etapes") ?? assert.fail("pas d'étapes")).children as Faux[];

// Les étapes d'un critère, lues par la section que la fiche pose.
const statesDe = (enregistrement: object) => {
  const [line] = lines(poserTestsDeCard(doc, { criteria: [enregistrement] })[0] as Faux);
  return steps(line ?? assert.fail("pas de ligne")).map((e) => e.dataset.etat);
};

describe("les étapes d'un critère", () => {
  test("rouge sur main, vert sur la branche, puis N = total − attrapées mutations survécues, avec le total", () => {
    const [, rate] = lines(section());
    assert.deepEqual(steps(rate ?? assert.fail("")).map((e) => [e.dataset.etat, e.dessous("span").at(-1)?.textContent]), [["done", "red on main"], ["done", "green on the branch"], ["failed", "survived 2 of 5 mutations"]]);
    assert.deepEqual(statesDe({ redOnMain: false, greenOnBranch: false, mutationsCaught: 4, mutationsTotal: 4 }), ["failed", "failed", "done"]);
  });

  test("un champ qui manque ou qui ne se lit pas est pending, jamais done", () => {
    assert.deepEqual(statesDe({}), ["pending", "pending", "pending"]);
    for (const mal of [{ mutationsTotal: 5 }, { mutationsCaught: 5 }, { mutationsCaught: 0, mutationsTotal: 0 }, { mutationsCaught: 6, mutationsTotal: 5 }, { mutationsCaught: -1, mutationsTotal: 5 }, { mutationsCaught: "5", mutationsTotal: 5 }, { redOnMain: "yes", greenOnBranch: 1 }]) {
      assert.deepEqual(statesDe(mal), ["pending", "pending", "pending"], JSON.stringify(mal));
    }
  });
});

describe("la section de la fiche", () => {
  test("trois critères : trois lignes, chacune son texte et le chemin de son test", () => {
    const rangs = lines(section());
    assert.equal(rangs.length, 3);
    assert.deepEqual(rangs.map((rang) => rang.dessous("p")[0]?.textContent), FIXTURE.criteria.map(({ criterion }) => criterion));
    assert.deepEqual(rangs.map((rang) => rang.dessous("code")[0]?.textContent), FIXTURE.criteria.map(({ testPath }) => testPath));
  });

  test("chaque ligne dit ses trois étapes dans l'ordre, chacune dans son état ; le marqueur a une forme par état", () => {
    const [fini, rate, empty] = lines(section());
    assert.deepEqual(steps(fini ?? assert.fail("")).map((e) => [e.dataset.etat, e.dessous("span").at(-1)?.textContent]), [["done", "red on main"], ["done", "green on the branch"], ["done", "survived 0 of 5 mutations"]]);
    assert.deepEqual(steps(rate ?? assert.fail("")).map((e) => [e.dataset.etat, e.dessous("span").at(-1)?.textContent]), [["done", "red on main"], ["done", "green on the branch"], ["failed", "survived 2 of 5 mutations"]]);
    assert.deepEqual(steps(empty ?? assert.fail("")).map((e) => [e.dataset.etat, e.dessous("span").at(-1)?.textContent]), [["pending", "red on main"], ["pending", "green on the branch"], ["pending", "survived ? mutations"]]);
    const formes = ["done", "failed", "pending"].map((state) => steps(lines(section())[state === "done" ? 0 : state === "failed" ? 1 : 2] ?? assert.fail("")).at(-1)?.dessous("span")[0]?.dataset.forme);
    assert.deepEqual(formes, ["disque", "carre", "anneau"]);
  });

  test("une mutation survivante est dite avec sa ligne ; un critère sans mutation survivante n'en dit aucune", () => {
    const [fini, rate, empty] = lines(section());
    assert.deepEqual((rate ?? assert.fail("")).dessous("code").slice(1).map(({ textContent }) => textContent), FIXTURE.criteria[1]?.survivingLines);
    assert.equal((fini ?? assert.fail("")).dessous("code").length, 1);
    assert.equal((empty ?? assert.fail("")).dessous("code").length, 1);
    const sansLine = poserTestsDeCard(doc, { criteria: [{ criterion: "x", testPath: "t", redOnMain: true, greenOnBranch: true, mutationsCaught: 0, mutationsTotal: 2 }] })[0] as Faux;
    assert.equal(sansLine.dessous("code").at(-1)?.textContent, "no surviving line given");
  });

  test("le renvoi de la pass est dit en tête quand la fiche en porte un, et nulle part sinon", () => {
    const avec = section();
    assert.equal(avec.children[0]?.textContent, "Sent back: a frozen acceptance test was modified");
    const sans = poserTestsDeCard(doc, { criteria: FIXTURE.criteria })[0] as Faux;
    assert.equal(sans.dessous("p").some(({ className }) => className === "renvoi"), false);
  });

  test("sans enregistrement, rien ; une liste de critères illisible se dit en une ligne, sans critère inventé", () => {
    assert.deepEqual(poserTestsDeCard(doc, undefined), []);
    assert.deepEqual(poserTestsDeCard(doc, null), []);
    const illisible = poserTestsDeCard(doc, { criteria: "three" })[0] as Faux;
    assert.equal(illisible.textContent, "The criteria and their tests not reached.");
    assert.equal(lines(illisible).length, 0);
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
    const demarrage = () => ({
      configuration: pourLaBar({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade" }] }, () => true),
      palette: PALETTE,
      exemple: EXEMPLE,
      onglets: ONGLETS, rubriques: RUBRIQUES,
      gestes: { allumage: ALLUMAGE, cuisine: KITCHEN_ACTIONS, directs: DIRECTS, confirmes: CONFIRMES },
      banniere: BANNIERE,
      calibrage: { modeles: MODELES, efforts: EFFORTS },
      code: undefined,
    });
    const vue = await jouerLaVue({ demarrage, espace: () => [SECOND], machines: () => [{ id: "poste", titre: "this computer" }] });
    (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
    await repos();
    const recue = holdFacts(() => new Map()).recevoir({ projet: "parade", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(FACTS) }] });
    vue.dire("surFaits", { ...recue, demande: vue.dernier("faits")[0] as number });
    await repos();
    (cardDuTicket(vue, 14) ?? assert.fail("pas de bon #14")).click();
    await repos();
    assert.equal(vue.element("fiche").dessous("section").some(({ className }) => className === "tests-de-fiche"), false);
    vue.element("fiche").children[0]?.dessous("button").find(({ className }) => className === "fermer")?.click();
    await repos();
    const avec = JSON.parse(JSON.stringify(recue), (cle, valeur) => (valeur !== null && typeof valeur === "object" && valeur.ticket === 14 && "fiche" in valeur ? { ...valeur, tests: FIXTURE } : valeur));
    vue.dire("surFaits", { ...avec, demande: vue.dernier("faits")[0] as number });
    await repos();
    (cardDuTicket(vue, 14) ?? assert.fail("pas de bon #14")).click();
    await repos();
    const posee = vue.element("fiche").dessous("section").find(({ className }) => className === "tests-de-fiche") ?? assert.fail("pas de section sur la fiche");
    assert.equal(lines(posee).length, 3);
    assert.match(posee.textContent, /Sent back: a frozen acceptance test was modified/);
  });
});
