// Test d'acceptation gelé (#4238). Critère 7 : le TODO du chef est à un clic au plus ; il liste exactement les tickets qui attendent le chef, parked compris.
import assert from "node:assert/strict";
import { test } from "node:test";
import { forTheBar } from "../../src/bar.ts";
import { EXAMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/colors.ts";
import { BANNER, holdFacts, type Facts } from "../../src/facts.ts";
import { actionsOfCard } from "../../src/card-actions.ts";
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
  gestes: {},
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

test("le TODO, à un clic au plus, liste exactement ce qui attend le chef, parked compris", async () => {
  const third = { quoi: "your call", qui: "the chef", depuis: "2026-11-24T10:00:00Z", relance: "2026-11-28T09:00:00Z", aLArrivee: "goes on" };
  const vue = await show({
    rail: [card(51, "pris", { tiers: third }), card(52, "pris"), card(53, "en pass")],
    attend: [{ ticket: 50, titre: "A question", url: url(50) }, { ticket: 51, titre: "Ticket 51", url: url(51) }],
  });
  const todo = [...vue.element("rail").descendants()].find(({ className, ariaLabel }) => className === "todo-du-rail" || /awaits you/i.test(ariaLabel));
  const opener = [...vue.poses()].find((el) => el.balise === "button" && /todo/i.test(el.textContent + el.ariaLabel + el.title));
  if (opener !== undefined) opener.click();
  await repos();
  const list = todo ?? [...vue.poses()].find(({ className, ariaLabel }) => /todo/i.test(className) || /todo|awaits you/i.test(ariaLabel)) ?? assert.fail("pas de TODO");
  const said = [...new Set(list.dessous("li").flatMap(({ dataset }) => (dataset.ticket === undefined ? [] : [Number(dataset.ticket)])))].sort();
  assert.deepEqual(said, [50, 51]);
});
