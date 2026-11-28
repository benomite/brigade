// Test d'acceptation gelé (#4238). Critère 3 : une carte parked, dans la colonne où elle attend, dit qui elle attend et jusqu'à quand.
import assert from "node:assert/strict";
import { test } from "node:test";
import { forTheBar } from "../../src/bar.ts";
import { EXAMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/colors.ts";
import { holdFacts, type Facts } from "../../src/facts.ts";
import { actionsOfCard } from "../../src/card-actions.ts";
import { HEADINGS } from "../../src/tabs.ts";
import { EFFORTS, MODELS } from "../../src/projects/projects.ts";
import type { Terminal } from "../../src/terminals.ts";
import { type Fake, type Played, playTheVue, repos } from "../helpers/false-vue.ts";

const PARADE = "parade";
const A = "2026-11-25T09:00:00.000Z";
const url = (ticket: number) => `https://github.com/chef/parade/issues/${ticket}`;
const SECOND: Terminal = { id: 1, projet: PARADE, genre: "second", titre: "second · claude", note: "session neuve", arrete: false };
const startup = () => ({
  configuration: forTheBar({ chemin: "/tmp/app.json", projets: [{ nom: PARADE, dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE, exemple: EXAMPLE, rubriques: HEADINGS,
  gestes: {},
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
const allTheText = (vue: Played): string => vue.element("rail").textContent;
const titles = (el: Fake): string[] => el.dessous("h4").map((h) => h.textContent.trim());
const columns = (vue: Played): Fake[] => (vue.element("rail").children.find(({ className }) => className === "colonnes") ?? assert.fail("pas de colonnes")).children;
const column = (vue: Played, name: RegExp): Fake => columns(vue).find((c) => name.test(titles(c)[0] ?? "")) ?? assert.fail(`pas de colonne ${name}`);
const numbers = (el: Fake): number[] => el.dessous("li").filter(({ dataset }) => dataset.ticket !== undefined).map(({ dataset }) => Number(dataset.ticket));

test("la carte parked reste dans sa colonne, dit qui elle attend et jusqu'à quand", async () => {
  const third = { quoi: "the invoice", qui: "Camille", depuis: "2026-11-24T10:00:00Z", relance: "2026-11-28T09:00:00Z", aLArrivee: "goes on" };
  const vue = await show({ rail: [card(21, "pris", { tiers: third }), card(22, "pris")] });
  const cooks = column(vue, /cook/i);
  assert.ok(numbers(cooks).includes(21), "the parked card stays in the column where it waits");
  const slip = cooks.dessous("li").find(({ dataset }) => dataset.ticket === "21") ?? assert.fail("pas de carte");
  const said = slip.textContent;
  assert.match(said, /parked/i);
  assert.match(said, /Camille/);
  assert.match(said, /28|Nov/i);
  assert.doesNotMatch((cooks.dessous("li").find(({ dataset }) => dataset.ticket === "22") ?? assert.fail("pas de carte")).textContent, /parked|Camille/i);
});
