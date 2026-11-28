// Test de la vue entière (ticket 4281), sur le harnais du test gelé de #4238.
import assert from "node:assert/strict";
import { test } from "node:test";
import { forTheBar } from "../../../src/bar.ts";
import { EXAMPLE } from "../../../src/config.ts";
import { PALETTE } from "../../../src/colors.ts";
import { holdFacts, type Facts } from "../../../src/facts.ts";
import { actionsOfCard } from "../../../src/card-actions.ts";
import { HEADINGS } from "../../../src/tabs.ts";
import { EFFORTS, MODELS } from "../../../src/projects/projects.ts";
import type { Terminal } from "../../../src/terminals.ts";
import { type Fake, type Played, playTheVue, repos } from "../../helpers/false-vue.ts";

const PARADE = "parade";
const A = "2026-11-25T09:00:00.000Z";
const url = (ticket: number) => `https://github.com/chef/parade/issues/${ticket}`;
const SECOND: Terminal = { id: 1, projet: PARADE, genre: "second", titre: "second · claude", note: "session neuve", arrete: false };
const startup = () => ({
  configuration: forTheBar({ chemin: "/tmp/app.json", projets: [{ nom: PARADE, dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE, exemple: EXAMPLE, rubriques: HEADINGS,
  calibrage: { modeles: MODELS, efforts: EFFORTS }, });
async function open(): Promise<Played> {
  const vue = await playTheVue({ demarrage: startup, espace: () => [SECOND], ouvrirIssue: () => true, gestesDeFiche: (card) => actionsOfCard(card) });
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  return vue;
}
const card = (ticket: number, state: string, extra: object = {}) => ({ ticket, etat: state, titre: `Ticket ${ticket}`, url: url(ticket), activite: null, ...extra });
async function show(facts: Partial<Facts> & { rail: Facts["rail"] }, vue?: Played): Promise<Played> {
  const openOne = vue ?? (await open());
  const complete: Facts = { etat: "ouverte", lu: A, compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, attend: [], ...facts };
  const receivedOne = holdFacts().recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(complete) }] });
  openOne.dire("surFaits", { ...receivedOne, demande: openOne.dernier("faits")[0] as number });
  await repos();
  return openOne;
}

// Le TODO du chef dans la vue (ticket 4281) : #51 et #52, parked pour le chef, y disent qui, pour quoi et jusqu'à quand ;
// #53, parked pour Camille, n'y est pas. Une entrée sans question n'a
// aucun bouton : ni « resume », ni « it arrived », ni contrôle de park.
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

test("the chef's TODO lists the parked tickets that wait for the chef, with who, for what and until when, and no gesture button", async () => {
  const vue = await show(FACTS);
  assert.deepEqual(entries(vue).map(({ dataset }) => Number(dataset.ticket)), [51, 52]);
  assert.equal(entry(vue, 51).dessous("span").find(({ className }) => className === "qui-jusqua")?.textContent, "waits for the chef · until 2026-11-28");
  assert.equal(entry(vue, 51).dessous("p")[0]?.textContent, "your call");
  assert.equal(entry(vue, 51).dessous("button")[0]?.title, "open #51's card — parked — waits for the chef, until 28 Nov, 09:00 UTC");
  assert.deepEqual(entry(vue, 51).dessous("button").slice(1).map(({ textContent }) => textContent), []);
  assert.equal(vue.appels.filter(({ geste: action }) => action === "attente").length, 0);
});

test("read-only, the TODO entries still say who and until when", async () => {
  const vue = await show({ ...FACTS, lectureSeule: { depot: "chef/parade" } } as never);
  assert.deepEqual(entries(vue).map((one) => one.dessous("span").find(({ className }) => className === "qui-jusqua")?.textContent), ["waits for the chef · until 2026-11-28", "waits for the chef · until 2026-11-28"]);
});
