// Test d'acceptation gelé (#4238). Critère 6 : aucune bannière n'apparaît sans une action que le chef peut prendre.
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

test("une alerte sans geste ne fait pas de bannière ; chaque message montré offre un bouton", async () => {
  const alertsOfRail = [
    { sorte: "relance-en-boucle", phrase: "#4047 was relaunched 5 times in 20 min.", fait: { depuis: "2026-11-25T08:00:00Z", ticket: 4047 }, geste: null, geree: "The station stopped the loop." },
    { sorte: "base-rouge", phrase: "Main is red since 08:00.", fait: { depuis: "2026-11-25T08:00:00Z", check: "tests" }, geste: "Open the failing check", geree: null },
  ] as unknown as NonNullable<Facts["alertesDuRail"]>;
  const vue = await show({ rail: [card(41, "pris")], alertesDuRail: alertsOfRail });
  const root = vue.element("rail");
  assert.doesNotMatch(allTheText(vue), /relaunched 5 times/, "a message with no action is not a banner");
  const shows = root.textContent.includes("Main is red");
  assert.ok(shows, "the message with a gesture is shown");
  const carrier = [...root.descendants()].filter((el) => el.textContent.includes("Main is red") && el.dessous("button").length > 0);
  assert.ok(carrier.length > 0, "the shown message offers a button");
  assert.ok(vue.poses().filter(({ className }) => /banner|banniere|fault/i.test(className)).every((b) => b.dessous("button").length > 0), "no banner without a button");
});
