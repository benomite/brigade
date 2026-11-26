// Test de la vue entière (ticket 4281), sur le harnais du test gelé de #4238.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ALLUMAGE } from "../../../src/allumage.ts";
import { ACTIONS_D_WAIT } from "../../../src/wait.ts";
import { pourLaBar } from "../../../src/bar.ts";
import { EXEMPLE } from "../../../src/config.ts";
import { PALETTE } from "../../../src/couleurs.ts";
import { KITCHEN_ACTIONS } from "../../../src/kitchen.ts";
import { BANNIERE, holdFacts, type Facts } from "../../../src/facts.ts";
import { actionsDeCard } from "../../../src/card-actions.ts";
import { CONFIRMES, DIRECTS } from "../../../src/actions.ts";
import { ONGLETS, RUBRIQUES } from "../../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../../src/projects/projects.ts";
import type { Terminal } from "../../../src/terminaux.ts";
import { type Faux, type Jouee, jouerLaVue, repos } from "../../aides/fausse-vue.ts";

const PARADE = "parade";
const A = "2026-11-25T09:00:00.000Z";
const url = (ticket: number) => `https://github.com/chef/parade/issues/${ticket}`;
const SECOND: Terminal = { id: 1, projet: PARADE, genre: "second", titre: "second · claude", note: "session neuve", arrete: false };
const demarrage = () => ({
  configuration: pourLaBar({ chemin: "/tmp/app.json", projets: [{ nom: PARADE, dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE, exemple: EXEMPLE, onglets: ONGLETS, rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: KITCHEN_ACTIONS, directs: DIRECTS, confirmes: CONFIRMES, attente: ACTIONS_D_WAIT },
  banniere: BANNIERE, calibrage: { modeles: MODELES, efforts: EFFORTS }, code: undefined,
});
async function ouvrir(wait: () => { fait: string } | { refus: string }): Promise<Jouee> {
  const vue = await jouerLaVue({ demarrage, attente: wait, espace: () => [SECOND], ouvrirIssue: () => true, gestesDeFiche: (card) => actionsDeCard(card) });
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  return vue;
}
const card = (ticket: number, state: string, extra: object = {}) => ({ ticket, etat: state, titre: `Ticket ${ticket}`, url: url(ticket), activite: null, ...extra });
async function show(facts: Partial<Facts> & { rail: Facts["rail"] }, wait: () => { fait: string } | { refus: string }, vue?: Jouee): Promise<Jouee> {
  const ouverte = vue ?? (await ouvrir(wait));
  const complet: Facts = { etat: "ouverte", lu: A, dernierTick: A, compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, dernierEvenement: null, cooks: [], attend: [], ...facts };
  const recue = holdFacts().recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(complet) }] });
  ouverte.dire("surFaits", { ...recue, demande: ouverte.dernier("faits")[0] as number });
  await repos();
  return ouverte;
}

// Le TODO du chef dans la vue (ticket 4281) : #51 et #52, parked pour le chef, y disent qui, pour quoi et jusqu'à quand ;
// #53, parked pour Camille, n'y est pas. « it arrived, back to the kitchen » renvoie #51 par le pont, et l'entrée quitte le
// TODO ; le contrôle de park de #52 part par le geste d'attente, et dit ce qui en est revenu.
const pourLeChef = (quoi: string) => ({ quoi, qui: "the chef", depuis: "2026-11-24T10:00:00Z", relance: "2026-11-28T09:00:00Z", aLArrivee: "goes on" });
const FACTS = {
  rail: [card(51, "pris", { tiers: pourLeChef("your call") }), card(52, "en pass", { tiers: pourLeChef("the logo") }), card(53, "pris", { tiers: { ...pourLeChef("the keys"), qui: "Camille" } })],
};
// Le TODO est une ligne au-dessus des colonnes (#4354) : un clic la déplie, s'il ne l'est pas déjà.
const todoDe = (vue: Jouee) => {
  const opinion = vue.element("rail").children.find(({ className }) => className === "avis-du-todo") ?? assert.fail("pas de TODO");
  const [line] = opinion.dessous("button");
  if (line?.ariaExpanded !== "true") line?.click();
  return opinion.children.find(({ className }) => className === "todo-du-rail") ?? assert.fail("TODO pas déplié");
};
const entrees = (vue: Jouee) => todoDe(vue).dessous("li").filter(({ className }) => className === "entree-du-todo");
const entree = (vue: Jouee, ticket: number) => entrees(vue).find(({ dataset }) => dataset.ticket === String(ticket)) ?? assert.fail(`pas de #${ticket}`);
const attentes = (vue: Jouee) => vue.appels.filter(({ geste: action }) => action === "attente").map(({ args }) => args);

test("the chef's TODO lists the parked tickets that wait for the chef, with who, for what, until when and their buttons", async () => {
  let ouvert = true;
  const vue = await show(FACTS, () => (ouvert ? { fait: "posted" } : { refus: "closed" }));
  assert.deepEqual(entrees(vue).map(({ dataset }) => Number(dataset.ticket)), [51, 52]);
  assert.equal(entree(vue, 51).dessous("span").find(({ className }) => className === "qui-jusqua")?.textContent, "waits for the chef · until 2026-11-28");
  assert.equal(entree(vue, 51).dessous("p")[0]?.textContent, "your call");
  assert.equal(entree(vue, 51).dessous("button")[0]?.title, "open #51's card — parked — waits for the chef, until 28 Nov, 09:00 UTC");
  assert.deepEqual(entree(vue, 51).dessous("button").slice(1).map(({ textContent }) => textContent), ["resume", "it arrived, back to the kitchen", "park or unpark…"]);
  const arrivee = entree(vue, 51).dessous("button").find((b) => b.textContent === "it arrived, back to the kitchen") ?? assert.fail("pas de bouton");
  const todo = todoDe(vue);
  arrivee.click();
  assert.equal(todo.dessous("li").some(({ dataset }) => dataset.ticket === "51"), false, "the entry leaves the TODO");
  ouvert = false;
  await repos();
  assert.deepEqual(attentes(vue), [[PARADE, "attente-arrivee", 51]]);
});

test("the park control of a TODO entry parks it through the kitchen's waiting gesture, and says what came back", async () => {
  const vue = await show(FACTS, () => ({ refus: "nothing is written: the follow-up date is not a day" }));
  entree(vue, 52).dessous("button").find(({ dataset }) => dataset.action === "open-park")!.click();
  await repos();
  const champ = (name: string) => entree(vue, 52).dessous("input").find(({ dataset }) => dataset.field === name) ?? assert.fail(`pas de ${name}`);
  champ("who").value = "Camille";
  champ("what").value = "the logo";
  champ("until").value = "the vendor answers";
  entree(vue, 52).dessous("button").find(({ dataset }) => dataset.action === "park")!.click();
  await repos();
  assert.deepEqual(attentes(vue), [[PARADE, "attente-poser", 52, { quoi: "the logo", qui: "Camille", relance: "the vendor answers" }]]);
  assert.equal(entree(vue, 52).dessous("p").find(({ className }) => className === "park-reason")?.textContent, "nothing is written: the follow-up date is not a day");
});

test("read-only, the TODO entries still say who and until when, with no park control", async () => {
  const vue = await show({ ...FACTS, lectureSeule: { depot: "chef/parade" } } as never, () => undefined as never);
  assert.deepEqual(entrees(vue).map((une) => une.dessous("span").find(({ className }) => className === "qui-jusqua")?.textContent), ["waits for the chef · until 2026-11-28", "waits for the chef · until 2026-11-28"]);
  assert.equal(todoDe(vue).dessous("button").some(({ dataset }) => dataset.action === "open-park"), false);
});
