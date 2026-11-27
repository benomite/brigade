// Ce que fait le cook d'un ticket, sur sa fiche (#1846) : à la place de son terminal, ce que le process principal en lit
// sur GitHub (#2061). La lecture du rail est écrite à la main, telle que lecture.ts la rend, puis rangée comme le process
// principal la range (`activitesPubliees`) ; la vue est jouée telle qu'elle est, devant un faux document
// (helpers/false-vue.ts). Tant qu'il tourne, la fiche suit son cook à chaque lecture ; fini, elle le dit et ouvre sa PR.
// Aucune page de worktree ne s'y ouvre.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { POWER_UP } from "../../src/power-up.ts";
import { forTheBar } from "../../src/bar.ts";
import { EXAMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/colors.ts";
import { KITCHEN_ACTIONS } from "../../src/kitchen.ts";
import { BANNER, holdFacts, type Facts } from "../../src/facts.ts";
import { CONFIRMED, DIRECT } from "../../src/actions.ts";
import { TABS, HEADINGS } from "../../src/tabs.ts";
import { EFFORTS, MODELS } from "../../src/projects/projects.ts";
import { activitiesPublished, type ActivityOfCook, type ActivitiesPublished, type StepOfCook } from "../../src/board/read.ts";
import { IN_PROGRESS, UNAVAILABLE, WITHOUT_PR, SOURCE, TITLE } from "../../src/vue/activity-of-cook.js";
import { cardOfTicket, type Fake, type Played, playTheVue, openTab, repos } from "../helpers/false-vue.ts";

const PARADE = "parade";
const A = "2026-10-23T10:04:30.000Z";
const PR = "https://github.com/chef/parade/pull/40";

const startup = () => ({
  configuration: forTheBar({ chemin: "/tmp/app.json", projets: [{ nom: PARADE, dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE,
  exemple: EXAMPLE,
  onglets: TABS,
  rubriques: HEADINGS,
  gestes: { allumage: POWER_UP, cuisine: KITCHEN_ACTIONS, directs: DIRECT, confirmes: CONFIRMED },
  banniere: BANNER,
  calibrage: { modeles: MODELS, efforts: EFFORTS },
  code: undefined,
});

const COOK_14 = { ticket: 14, titre: "Le journal en ajout seul", station: "box/claude" };
const FACTS: Facts = {
  etat: "ouverte",
  lu: A,
  dernierTick: A,
  compteurs: { rail: 0, auTravail: 1, aLaPass: 0, attend: 0, livres24h: 0 },
  dernierEvenement: null,
  rail: [{ ticket: 14, etat: "pris", titre: COOK_14.titre, url: "https://github.com/chef/parade/issues/14", activite: null }],
  cooks: [COOK_14],
  attend: [],
};
// La station de #14, telle que le runtime la rend dans `facts` (runtime/src/etat.ts).
const STATIONS = [
  { station: "box/claude", distante: false, plafond: 2, ordinaires: false, bacASable: null, prendOrdinaires: true, cuisson: "cooking", arreteeDepuis: null, refus: null, cooks: [COOK_14] },
];

const step = (doneEn: string, target: string | null, since: string): StepOfCook => ({ fait: doneEn, faitEn: doneEn, cible: target, depuis: since });
const LIT = step("reading", "runtime/src/etat.ts", "2026-10-23T09:55:00.000Z");
const WRITTEN = step("writing", "app/src/bon.ts", "2026-10-23T10:02:30.000Z");
const TESTS = step("running the tests", null, "2026-10-23T10:04:00.000Z");
const IN_PROGRESS_14: ActivityOfCook = {
  ticket: 14,
  titre: COOK_14.titre,
  run: "14-aa",
  station: "box/claude",
  lanceLe: "2026-10-23T09:52:30.000Z",
  finiLe: null,
  fin: null,
  maintenant: WRITTEN,
  etapes: [LIT, WRITTEN],
  tours: 12,
  tokens: 48_210,
  pr: null,
};

// Ce que la vue reçoit d'une lecture du rail de parade, faite à `A`, qui porte ces activités : rangée comme main.ts la
// range.
const readOne = (activities: ActivityOfCook[]): ActivitiesPublished =>
  activitiesPublished(PARADE, { lu: true, depot: "chef/parade", luLe: A, cuisine: { rubriques: [] }, faits: {}, file: [], bilans: [], lignesDuRail: [], activites: activities });

async function open(): Promise<Played> {
  const vue = await playTheVue({ demarrage: startup, espace: () => [], ouvrirPrDuCook: () => true });
  (vue.element("projets").children.at(1) ?? assert.fail("pas de case pour parade")).click();
  await repos();
  const receivedOne = holdFacts().recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify({ ...FACTS, stations: STATIONS }) }] });
  vue.dire("surFaits", { ...receivedOne, demande: vue.dernier("faits")[0] as number });
  await repos();
  return vue;
}
// La fiche de #14, ouverte comme le chef l'ouvre : sa carte, sur le kanban de l'onglet Rail.
async function openTheCard(vue: Played): Promise<void> {
  await openTab(vue, "Rail");
  const card = cardOfTicket(vue, 14) ?? assert.fail("pas de carte #14 sur Rail");
  card.click();
  await repos();
  assert.equal(vue.element("fiche").hidden, false);
}
const section = (vue: Played): Fake | undefined => vue.element("fiche").dessous("section").find((pose) => pose.className === "activite-du-cook");
const saidOne = (vue: Played) => section(vue) ?? assert.fail("la fiche ne dit pas ce que fait son cook");
const now = (vue: Played) => saidOne(vue).dessous("p").find((p) => p.className === "maintenant")?.textContent;
const steps = (vue: Played) => saidOne(vue).dessous("li").map((li) => li.children[0]?.textContent);
// Le bouton qui ouvre sa PR — le seul geste de la section, hors de l'icône d'aide de sa source.
const buttonPr = (vue: Played) => saidOne(vue).dessous("button").find((button) => button.className === "pr");

describe("la fiche d'un ticket suit son cook, tel que sa station le publie", () => {
  test("ouverte sur un cook qui tourne : ce qu'il fait, ses derniers gestes ; la lecture suivante la fait avancer", async () => {
    const vue = await open();
    await openTheCard(vue);
    // Avant toute lecture du rail, aucune section : rien n'est inventé.
    assert.equal(section(vue), undefined);

    vue.dire("surActivites", readOne([IN_PROGRESS_14]));
    await repos();
    assert.equal(saidOne(vue).dessous("h4")[0]?.textContent, TITLE);
    assert.match(saidOne(vue).textContent, new RegExp(IN_PROGRESS));
    assert.match(saidOne(vue).textContent, /on box\/claude · 12 turns · 48,210 tokens/);
    assert.equal(now(vue), "nowwriting app/src/bon.tsfor 2 min");
    assert.deepEqual(steps(vue), ["reading runtime/src/etat.ts"]);
    // Pas encore de PR : aucun bouton qui l'ouvre, et rien ne dit qu'il n'en a pas — il tourne.
    assert.equal(buttonPr(vue), undefined);
    assert.doesNotMatch(saidOne(vue).textContent, new RegExp(WITHOUT_PR));

    // La station publie l'étape suivante : la fiche ouverte la montre, sans un geste du chef.
    vue.dire("surActivites", readOne([{ ...IN_PROGRESS_14, maintenant: TESTS, etapes: [LIT, WRITTEN, TESTS], tours: 15 }]));
    await repos();
    assert.equal(now(vue), "nowrunning the testsfor 30 s");
    assert.deepEqual(steps(vue), ["reading runtime/src/etat.ts", "writing app/src/bon.ts"]);
    assert.match(saidOne(vue).textContent, /15 turns/);
    // Sa source, en dernière ligne : GitHub, à l'heure de la lecture — le reste au survol.
    const source = saidOne(vue).dessous("small").find((pose) => pose.className === "source") ?? assert.fail("pas de source");
    assert.match(source.textContent, /^as GitHub said at 10:04 UTC/);
    assert.equal((source.dessous("button")[0] as { ariaLabel?: string } | undefined)?.ariaLabel, SOURCE);
  });

  test("fini : la fiche le dit, et ouvre sa PR d'un bouton ; fini sans PR, une ligne le dit", async () => {
    const vue = await open();
    await openTheCard(vue);
    const finished: ActivityOfCook = { ...IN_PROGRESS_14, finiLe: "2026-10-23T10:04:10.000Z", fin: "ok", maintenant: null, etapes: [LIT, WRITTEN, TESTS], pr: { numero: 40, url: PR } };
    vue.dire("surActivites", readOne([finished]));
    await repos();
    assert.match(saidOne(vue).textContent, /finished/);
    assert.doesNotMatch(saidOne(vue).textContent, new RegExp(IN_PROGRESS));
    assert.equal(now(vue), undefined);
    assert.deepEqual(steps(vue), ["reading runtime/src/etat.ts", "writing app/src/bon.ts", "running the tests"]);
    const pr = buttonPr(vue) ?? assert.fail("pas de bouton vers sa PR");
    assert.equal(pr.textContent, "open the PR of #14");
    pr.click();
    await repos();
    // La vue nomme le projet et le ticket : l'adresse reste au process principal, lue de la même lecture.
    assert.deepEqual(vue.dernier("ouvrirPrDuCook"), [PARADE, 14]);

    vue.dire("surActivites", readOne([{ ...finished, fin: "failed", pr: null }]));
    await repos();
    assert.match(saidOne(vue).textContent, /failed/);
    assert.match(saidOne(vue).textContent, new RegExp(WITHOUT_PR));
    assert.equal(buttonPr(vue), undefined);
  });

  test("une lecture qui ne dit pas l'activité de ses cooks : une ligne, pourquoi au survol", async () => {
    const vue = await open();
    await openTheCard(vue);
    vue.dire("surActivites", { projet: PARADE, sans: "GitHub did not answer: HTTP 502" });
    await repos();
    assert.match(saidOne(vue).textContent, new RegExp(UNAVAILABLE));
    assert.doesNotMatch(saidOne(vue).textContent, /exit code/);
  });

  test("un ticket dont aucun cook n'est publié n'a pas de section ; aucune page de worktree ne s'ouvre de la fiche", async () => {
    const vue = await open();
    await openTheCard(vue);
    vue.dire("surActivites", readOne([{ ...IN_PROGRESS_14, ticket: 99 }]));
    await repos();
    assert.equal(section(vue), undefined);
    vue.dire("surActivites", readOne([IN_PROGRESS_14]));
    await repos();
    assert.ok(!vue.element("fiche").dessous("button").some((button) => /browser|page/.test(button.textContent)));
    assert.doesNotMatch(vue.element("fiche").textContent, /port \d/);
    assert.ok(!vue.appels.some(({ geste: action }) => action === "ouvrirPage"));
  });
});

// Ticket 3716 : GitHub numérote issues et PR d'une seule suite — la PR #40 de #14 se lirait comme un ticket.
describe("la fiche dit la PR du cook par son ticket (ticket 3716)", () => {
  test("fini avec sa PR #40 : « open the PR of #14 », jamais « #40 » ; le bouton ouvre toujours sa PR", async () => {
    const vue = await open();
    await openTheCard(vue);
    vue.dire("surActivites", readOne([{ ...IN_PROGRESS_14, finiLe: "2026-10-23T10:04:10.000Z", fin: "ok", maintenant: null, etapes: [LIT], pr: { numero: 40, url: PR } }]));
    await repos();
    assert.doesNotMatch(saidOne(vue).textContent, /#40\b/);
    const pr = buttonPr(vue) ?? assert.fail("pas de bouton vers sa PR");
    assert.equal(pr.textContent, "open the PR of #14");
    pr.click();
    await repos();
    assert.deepEqual(vue.dernier("ouvrirPrDuCook"), [PARADE, 14]);
  });
});
