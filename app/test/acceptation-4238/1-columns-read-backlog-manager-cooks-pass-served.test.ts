// Test d'acceptation gelé (#4238). Critère 1 : les colonnes se lisent, de gauche à droite : backlog, manager, cooks, pass, served — le rail en haut du backlog, les tickets prêts à part.
import assert from "node:assert/strict";
import { test } from "node:test";
import { POWER_UP } from "../../src/power-up.ts";
import { forTheBar } from "../../src/bar.ts";
import { EXAMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/colors.ts";
import { KITCHEN_ACTIONS } from "../../src/kitchen.ts";
import { BANNER, holdFacts, type Facts } from "../../src/facts.ts";
import { actionsOfCard } from "../../src/card-actions.ts";
import { CONFIRMED, DIRECT } from "../../src/actions.ts";
import { TABS, HEADINGS } from "../../src/tabs.ts";
import { EFFORTS, MODELS } from "../../src/projects/projects.ts";
import type { Terminal } from "../../src/terminals.ts";
import { type Fake, type Played, playTheVue, repos } from "../helpers/false-vue.ts";

const PARADE = "parade";
const A = "2026-11-25T09:00:00.000Z";
const url = (ticket: number) => `https://github.com/chef/parade/issues/${ticket}`;
const SECOND: Terminal = { id: 1, projet: PARADE, genre: "second", titre: "second · claude", note: "session neuve", arrete: false };
const startup = () => ({
  configuration: forTheBar({ chemin: "/tmp/app.json", projets: [{ nom: PARADE, dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE, exemple: EXAMPLE, onglets: TABS, rubriques: HEADINGS,
  gestes: { allumage: POWER_UP, cuisine: KITCHEN_ACTIONS, directs: DIRECT, confirmes: CONFIRMED },
  banniere: BANNER, calibrage: { modeles: MODELS, efforts: EFFORTS }, code: undefined,
});
async function open(): Promise<Played> {
  const vue = await playTheVue({ demarrage: startup, espace: () => [SECOND], ouvrirIssue: () => true, gestesDeFiche: (card) => actionsOfCard(card) });
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  return vue;
}
const card = (ticket: number, state: string, extra: object = {}) => ({ ticket, etat: state, titre: `Ticket ${ticket}`, url: url(ticket), activite: null, ...extra });
async function show(facts: Partial<Facts> & { rail: Facts["rail"] }, vue?: Played): Promise<Played> {
  const openOne = vue ?? (await open());
  const complete: Facts = { etat: "ouverte", lu: A, dernierTick: A, compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, dernierEvenement: null, cooks: [], attend: [], ...facts };
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

test("les colonnes : backlog, manager, cooks, pass, served ; le rail en tête du backlog, les prêts à part", async () => {
  const vue = await show({ rail: [card(10, "en attente", { prete: true }), card(11, "pris"), card(12, "en pass"), card(13, "servi")] });
  const names = columns(vue).map((c) => (titles(c)[0] ?? "").toLowerCase());
  assert.deepEqual(names.map((n) => /backlog/.test(n) ? "backlog" : /manager/.test(n) ? "manager" : /cook/.test(n) ? "cooks" : /pass/.test(n) ? "pass" : /served/.test(n) ? "served" : n), ["backlog", "manager", "cooks", "pass", "served"]);
  const backlog = column(vue, /backlog/i);
  const sections = backlog.children.map((c) => c.textContent.toLowerCase());
  assert.ok(sections.findIndex((t) => /\brail\b/.test(t)) >= 0, "the rail is at the top of the backlog");
  assert.ok(sections.findIndex((t) => /ready/.test(t)) >= 0, "the ready tickets are set apart in the backlog");
  assert.ok(sections.findIndex((t) => /\brail\b/.test(t)) <= sections.findIndex((t) => /ready/.test(t)));
});

// Critère 2 : chaque carte de ticket est dans la colonne de son étape.
test("chaque carte est dans la colonne de son étape", async () => {
  const vue = await show({ rail: [card(10, "en attente"), card(11, "pris"), card(12, "en pass"), card(13, "servi")] });
  assert.ok(numbers(column(vue, /backlog/i)).includes(10));
  assert.deepEqual(numbers(column(vue, /cook/i)), [11]);
  assert.deepEqual(numbers(column(vue, /pass/i)), [12]);
  assert.deepEqual(numbers(column(vue, /served/i)), [13]);
  assert.ok(!numbers(column(vue, /manager/i)).some((n) => [10, 11, 12, 13].includes(n)));
});
