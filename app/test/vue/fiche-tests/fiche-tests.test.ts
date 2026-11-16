// Sur la fiche d'un ticket, pour chaque critère d'acceptation, son test et son chemin : rouge sur main, vert sur la branche,
// N mutations survécues (#3728). Une étape que l'enregistrement ne donne pas est pending, jamais done ; le renvoi de la pass
// se lit sur la fiche. Le module est joué devant un faux document, puis la vue telle qu'elle est (aides/fausse-vue.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../../../src/allumage.ts";
import { pourLaBarre } from "../../../src/barre.ts";
import { EXEMPLE } from "../../../src/config.ts";
import { PALETTE } from "../../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../../src/cuisine.ts";
import { BANNIERE, tenirFaits } from "../../../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../../../src/gestes.ts";
import { ONGLETS, RUBRIQUES } from "../../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../../src/projets/projets.ts";
import type { Terminal } from "../../../src/terminaux.ts";
import { etapesDe, poserTestsDeFiche } from "../../../src/vue/fiche-tests/fiche-tests.js";
import { carteDuTicket, Faux, jouerLaVue, repos } from "../../aides/fausse-vue.ts";

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

const section = () => (poserTestsDeFiche(doc, FIXTURE)[0] as Faux | undefined) ?? assert.fail("pas de section");
const lignes = (racine: Faux) => racine.dessous("li").filter(({ className }) => className === "critere-teste");
const etapes = (ligne: Faux) => (ligne.dessous("ol").find(({ className }) => className === "critere-etapes") ?? assert.fail("pas d'étapes")).children as Faux[];

describe("les étapes d'un critère", () => {
  test("rouge sur main, vert sur la branche, puis N = total − attrapées mutations survécues, avec le total", () => {
    assert.deepEqual(etapesDe(FIXTURE.criteria[1] ?? {}), [
      { etat: "done", dit: "red on main" },
      { etat: "done", dit: "green on the branch" },
      { etat: "failed", dit: "survived 2 of 5 mutations" },
    ]);
    assert.deepEqual(etapesDe({ redOnMain: false, greenOnBranch: false, mutationsCaught: 4, mutationsTotal: 4 }).map(({ etat }) => etat), ["failed", "failed", "done"]);
  });

  test("un champ qui manque ou qui ne se lit pas est pending, jamais done", () => {
    assert.deepEqual(etapesDe({}).map(({ etat }) => etat), ["pending", "pending", "pending"]);
    for (const mal of [{ mutationsTotal: 5 }, { mutationsCaught: 5 }, { mutationsCaught: 0, mutationsTotal: 0 }, { mutationsCaught: 6, mutationsTotal: 5 }, { mutationsCaught: -1, mutationsTotal: 5 }, { mutationsCaught: "5", mutationsTotal: 5 }, { redOnMain: "yes", greenOnBranch: 1 }]) {
      assert.deepEqual(etapesDe(mal as never).map(({ etat }) => etat), ["pending", "pending", "pending"], JSON.stringify(mal));
    }
  });
});

describe("la section de la fiche", () => {
  test("trois critères : trois lignes, chacune son texte et le chemin de son test", () => {
    const rangs = lignes(section());
    assert.equal(rangs.length, 3);
    assert.deepEqual(rangs.map((rang) => rang.dessous("p")[0]?.textContent), FIXTURE.criteria.map(({ criterion }) => criterion));
    assert.deepEqual(rangs.map((rang) => rang.dessous("code")[0]?.textContent), FIXTURE.criteria.map(({ testPath }) => testPath));
  });

  test("chaque ligne dit ses trois étapes dans l'ordre, chacune dans son état ; le marqueur a une forme par état", () => {
    const [fini, rate, vide] = lignes(section());
    assert.deepEqual(etapes(fini ?? assert.fail("")).map((e) => [e.dataset.etat, e.dessous("span").at(-1)?.textContent]), [["done", "red on main"], ["done", "green on the branch"], ["done", "survived 0 of 5 mutations"]]);
    assert.deepEqual(etapes(rate ?? assert.fail("")).map((e) => [e.dataset.etat, e.dessous("span").at(-1)?.textContent]), [["done", "red on main"], ["done", "green on the branch"], ["failed", "survived 2 of 5 mutations"]]);
    assert.deepEqual(etapes(vide ?? assert.fail("")).map((e) => [e.dataset.etat, e.dessous("span").at(-1)?.textContent]), [["pending", "red on main"], ["pending", "green on the branch"], ["pending", "survived ? mutations"]]);
    const formes = ["done", "failed", "pending"].map((etat) => etapes(lignes(section())[etat === "done" ? 0 : etat === "failed" ? 1 : 2] ?? assert.fail("")).at(-1)?.dessous("span")[0]?.dataset.forme);
    assert.deepEqual(formes, ["disque", "carre", "anneau"]);
  });

  test("une mutation survivante est dite avec sa ligne ; un critère sans mutation survivante n'en dit aucune", () => {
    const [fini, rate, vide] = lignes(section());
    assert.deepEqual((rate ?? assert.fail("")).dessous("code").slice(1).map(({ textContent }) => textContent), FIXTURE.criteria[1]?.survivingLines);
    assert.equal((fini ?? assert.fail("")).dessous("code").length, 1);
    assert.equal((vide ?? assert.fail("")).dessous("code").length, 1);
    const sansLigne = poserTestsDeFiche(doc, { criteria: [{ criterion: "x", testPath: "t", redOnMain: true, greenOnBranch: true, mutationsCaught: 0, mutationsTotal: 2 }] })[0] as Faux;
    assert.equal(sansLigne.dessous("code").at(-1)?.textContent, "no surviving line given");
  });

  test("le renvoi de la pass est dit en tête quand la fiche en porte un, et nulle part sinon", () => {
    const avec = section();
    assert.equal(avec.children[0]?.textContent, "Sent back: a frozen acceptance test was modified");
    const sans = poserTestsDeFiche(doc, { criteria: FIXTURE.criteria })[0] as Faux;
    assert.equal(sans.dessous("p").some(({ className }) => className === "renvoi"), false);
  });

  test("sans enregistrement, rien ; une liste de critères illisible se dit en une ligne, sans critère inventé", () => {
    assert.deepEqual(poserTestsDeFiche(doc, undefined), []);
    assert.deepEqual(poserTestsDeFiche(doc, null), []);
    const illisible = poserTestsDeFiche(doc, { criteria: "three" })[0] as Faux;
    assert.equal(illisible.textContent, "the criteria and their tests are unavailable");
    assert.equal(lignes(illisible).length, 0);
  });
});

describe("la fiche dans la vue", () => {
  const A = "2026-10-13T10:04:12.000Z";
  const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "second · claude", note: "", arrete: false };
  const FAITS = {
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
      configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade" }] }, () => true),
      palette: PALETTE,
      exemple: EXEMPLE,
      onglets: ONGLETS, rubriques: RUBRIQUES,
      gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES },
      banniere: BANNIERE,
      calibrage: { modeles: MODELES, efforts: EFFORTS },
      code: undefined,
    });
    const vue = await jouerLaVue({ demarrage, espace: () => [SECOND], machines: () => [{ id: "poste", titre: "this computer" }] });
    (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
    await repos();
    const recue = tenirFaits(() => new Map()).recevoir({ projet: "parade", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(FAITS) }] });
    vue.dire("surFaits", { ...recue, demande: vue.dernier("faits")[0] as number });
    await repos();
    (carteDuTicket(vue, 14) ?? assert.fail("pas de bon #14")).click();
    await repos();
    assert.equal(vue.element("fiche").dessous("section").some(({ className }) => className === "tests-de-fiche"), false);
    vue.element("fiche").children[0]?.dessous("button").find(({ className }) => className === "fermer")?.click();
    await repos();
    const avec = JSON.parse(JSON.stringify(recue), (cle, valeur) => (valeur !== null && typeof valeur === "object" && valeur.ticket === 14 && "fiche" in valeur ? { ...valeur, tests: FIXTURE } : valeur));
    vue.dire("surFaits", { ...avec, demande: vue.dernier("faits")[0] as number });
    await repos();
    (carteDuTicket(vue, 14) ?? assert.fail("pas de bon #14")).click();
    await repos();
    const posee = vue.element("fiche").dessous("section").find(({ className }) => className === "tests-de-fiche") ?? assert.fail("pas de section sur la fiche");
    assert.equal(lignes(posee).length, 3);
    assert.match(posee.textContent, /Sent back: a frozen acceptance test was modified/);
  });
});
