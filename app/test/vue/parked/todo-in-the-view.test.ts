// Test de la vue entière (ticket 4281), sur le harnais du test gelé de #4238.
import assert from "node:assert/strict";
import { test } from "node:test";
import { POWER_UP } from "../../../src/power-up.ts";
import { ACTIONS_OF_WAIT } from "../../../src/wait.ts";
import { forTheBar } from "../../../src/bar.ts";
import { EXAMPLE } from "../../../src/config.ts";
import { PALETTE } from "../../../src/colors.ts";
import { KITCHEN_ACTIONS } from "../../../src/kitchen.ts";
import { BANNER, holdFacts, type Facts } from "../../../src/facts.ts";
import { actionsOfCard } from "../../../src/card-actions.ts";
import { CONFIRMED, DIRECT } from "../../../src/actions.ts";
import { TABS, HEADINGS } from "../../../src/tabs.ts";
import { EFFORTS, MODELS } from "../../../src/projects/projects.ts";
import type { Terminal } from "../../../src/terminals.ts";
import { type Fake, type Played, playTheVue, repos } from "../../helpers/false-vue.ts";

const PARADE = "parade";
const A = "2026-11-25T09:00:00.000Z";
const url = (ticket: number) => `https://github.com/chef/parade/issues/${ticket}`;
const SECOND: Terminal = { id: 1, projet: PARADE, genre: "second", titre: "second · claude", note: "session neuve", arrete: false };
const startup = () => ({
  configuration: forTheBar({ chemin: "/tmp/app.json", projets: [{ nom: PARADE, dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE, exemple: EXAMPLE, onglets: TABS, rubriques: HEADINGS,
  gestes: { allumage: POWER_UP, cuisine: KITCHEN_ACTIONS, directs: DIRECT, confirmes: CONFIRMED, attente: ACTIONS_OF_WAIT },
  banniere: BANNER, calibrage: { modeles: MODELS, efforts: EFFORTS }, code: undefined,
});
async function open(wait: () => { fait: string } | { refus: string }): Promise<Played> {
  const vue = await playTheVue({ demarrage: startup, attente: wait, espace: () => [SECOND], ouvrirIssue: () => true, gestesDeFiche: (card) => actionsOfCard(card) });
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  return vue;
}
const card = (ticket: number, state: string, extra: object = {}) => ({ ticket, etat: state, titre: `Ticket ${ticket}`, url: url(ticket), activite: null, ...extra });
async function show(facts: Partial<Facts> & { rail: Facts["rail"] }, wait: () => { fait: string } | { refus: string }, vue?: Played): Promise<Played> {
  const openOne = vue ?? (await open(wait));
  const complete: Facts = { etat: "ouverte", lu: A, dernierTick: A, compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, dernierEvenement: null, cooks: [], attend: [], ...facts };
  const receivedOne = holdFacts().recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(complete) }] });
  openOne.dire("surFaits", { ...receivedOne, demande: openOne.dernier("faits")[0] as number });
  await repos();
  return openOne;
}

// Le TODO du chef dans la vue (ticket 4281) : #51 et #52, parked pour le chef, y disent qui, pour quoi et jusqu'à quand ;
// #53, parked pour Camille, n'y est pas. « it arrived, back to the kitchen » renvoie #51 par le pont, et l'entrée quitte le
// TODO ; le contrôle de park de #52 part par le geste d'attente, et dit ce qui en est revenu.
const forTheChef = (what: string) => ({ quoi: what, qui: "the chef", depuis: "2026-11-24T10:00:00Z", relance: "2026-11-28T09:00:00Z", aLArrivee: "goes on" });
const FACTS = {
  rail: [card(51, "pris", { tiers: forTheChef("your call") }), card(52, "en pass", { tiers: forTheChef("the logo") }), card(53, "pris", { tiers: { ...forTheChef("the keys"), qui: "Camille" } })],
};
// Le TODO est une ligne au-dessus des colonnes (#4354) : un clic la déplie, s'il ne l'est pas déjà.
const todoOf = (vue: Played) => {
  const opinion = vue.element("rail").children.find(({ className }) => className === "avis-du-todo") ?? assert.fail("pas de TODO");
  const [line] = opinion.dessous("button");
  if (line?.ariaExpanded !== "true") line?.click();
  return opinion.children.find(({ className }) => className === "todo-du-rail") ?? assert.fail("TODO pas déplié");
};
const entries = (vue: Played) => todoOf(vue).dessous("li").filter(({ className }) => className === "entree-du-todo");
const entry = (vue: Played, ticket: number) => entries(vue).find(({ dataset }) => dataset.ticket === String(ticket)) ?? assert.fail(`pas de #${ticket}`);
const waits = (vue: Played) => vue.appels.filter(({ geste: action }) => action === "attente").map(({ args }) => args);

test("the chef's TODO lists the parked tickets that wait for the chef, with who, for what, until when and their buttons", async () => {
  let opened = true;
  const vue = await show(FACTS, () => (opened ? { fait: "posted" } : { refus: "closed" }));
  assert.deepEqual(entries(vue).map(({ dataset }) => Number(dataset.ticket)), [51, 52]);
  assert.equal(entry(vue, 51).dessous("span").find(({ className }) => className === "qui-jusqua")?.textContent, "waits for the chef · until 2026-11-28");
  assert.equal(entry(vue, 51).dessous("p")[0]?.textContent, "your call");
  assert.equal(entry(vue, 51).dessous("button")[0]?.title, "open #51's card — parked — waits for the chef, until 28 Nov, 09:00 UTC");
  assert.deepEqual(entry(vue, 51).dessous("button").slice(1).map(({ textContent }) => textContent), ["resume", "it arrived, back to the kitchen", "park or unpark…"]);
  const arrival = entry(vue, 51).dessous("button").find((b) => b.textContent === "it arrived, back to the kitchen") ?? assert.fail("pas de bouton");
  const todo = todoOf(vue);
  arrival.click();
  // Répondue, l'entrée se replie sur une ligne qui dit la réponse (#4646), et le redessin la garde ainsi.
  assert.equal(todo.dessous("li").find(({ dataset }) => dataset.ticket === "51")?.dataset.plie, "", "the entry folds");
  assert.equal(entry(vue, 51).children.filter(({ hidden }) => !hidden).map(({ textContent }) => textContent).join(""), "#51 Ticket 51 · answered: “it arrived, back to the kitchen”");
  opened = false;
  await repos();
  assert.deepEqual(waits(vue), [[PARADE, "attente-arrivee", 51]]);
});

test("the park control of a TODO entry parks it through the kitchen's waiting gesture, and says what came back", async () => {
  const vue = await show(FACTS, () => ({ refus: "nothing is written: the follow-up date is not a day" }));
  entry(vue, 52).dessous("button").find(({ dataset }) => dataset.action === "open-park")!.click();
  await repos();
  const field = (name: string) => entry(vue, 52).dessous("input").find(({ dataset }) => dataset.field === name) ?? assert.fail(`pas de ${name}`);
  field("who").value = "Camille";
  field("what").value = "the logo";
  field("until").value = "the vendor answers";
  entry(vue, 52).dessous("button").find(({ dataset }) => dataset.action === "park")!.click();
  await repos();
  assert.deepEqual(waits(vue), [[PARADE, "attente-poser", 52, { quoi: "the logo", qui: "Camille", relance: "the vendor answers" }]]);
  assert.equal(entry(vue, 52).dessous("p").find(({ className }) => className === "park-reason")?.textContent, "nothing is written: the follow-up date is not a day");
});

test("read-only, the TODO entries still say who and until when, with no park control", async () => {
  const vue = await show({ ...FACTS, lectureSeule: { depot: "chef/parade" } } as never, () => undefined as never);
  assert.deepEqual(entries(vue).map((one) => one.dessous("span").find(({ className }) => className === "qui-jusqua")?.textContent), ["waits for the chef · until 2026-11-28", "waits for the chef · until 2026-11-28"]);
  assert.equal(todoOf(vue).dessous("button").some(({ dataset }) => dataset.action === "open-park"), false);
});
