// La vue du projet avec son journal du jour et la carte du digest de la veille (ticket 4274), jouée entière : la carte en
// tête à la première ouverture du jour seulement, le journal au-dessus des colonnes.
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
import { FakeStorage, type Played, playTheVue, repos } from "../helpers/false-vue.ts";

const PARADE = "parade";
const A = new Date().toISOString();
const SECOND: Terminal = { id: 1, projet: PARADE, genre: "second", titre: "second · claude", note: "session neuve", arrete: false };
const action = (line: string, kind: string, outcome: string) => ({ at: A, line, reason: "r", outcome, kind });
const startup = () => ({
  configuration: forTheBar({ chemin: "/tmp/app.json", projets: [{ nom: PARADE, dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE, exemple: EXAMPLE, onglets: TABS, rubriques: HEADINGS,
  gestes: { allumage: POWER_UP, cuisine: KITCHEN_ACTIONS, directs: DIRECT, confirmes: CONFIRMED },
  banniere: BANNER, calibrage: { modeles: MODELS, efforts: EFFORTS }, code: undefined,
});
// Le journal et le digest viennent des faits du projet (`fils`, `digest`), comme le reste de la vue ; le stockage de la vue
// garde le jour où la carte du matin s'est montrée, d'une ouverture de l'app à l'autre.
async function openWith(extra: object, storage: FakeStorage): Promise<Played> {
  const vue = await playTheVue({ demarrage: startup, espace: () => [SECOND], ouvrirIssue: () => true, gestesDeFiche: (card) => actionsOfCard(card) }, { stockage: storage });
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  const complete = { etat: "ouverte", lu: A, dernierTick: A, compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, dernierEvenement: null, cooks: [], attend: [], rail: [{ ticket: 10, etat: "en attente", titre: "Ticket 10", url: "https://github.com/chef/parade/issues/10", activite: null }], ...extra } as unknown as Facts;
  const receivedOne = holdFacts().recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(complete) }] });
  vue.dire("surFaits", { ...receivedOne, demande: vue.dernier("faits")[0] as number });
  await repos();
  return vue;
}

test("the digest card shows at the first opening of the day only: the app opened again the same day shows the logbook without it", async () => {
  const storage = new FakeStorage();
  const extra = { fils: { cook: [action("merged #4001 delivered", "delivered", "merged")] }, digest: "1 outage seen first by the chef" };
  const first = await openWith(extra, storage);
  const rail = first.element("rail");
  assert.equal(rail.children[0]?.ariaLabel, "Yesterday", "the card is the first thing of the view");
  assert.match(rail.textContent, /1 outage seen first by the chef/);
  const second = await openWith(extra, storage);
  assert.doesNotMatch(second.element("rail").textContent, /outage seen first by the chef/);
  assert.match(second.element("rail").textContent, /Today's logbook.*merged #4001 delivered/);
});

test("the logbook sits above the columns of the rail, the digest card above all", async () => {
  const vue = await openWith({ fils: { cook: [action("merged #4001 delivered", "delivered", "merged")] }, digest: "0 outages seen first by the chef" }, new FakeStorage());
  const text = vue.element("rail").textContent;
  assert.ok(text.indexOf("0 outages seen first by the chef") < text.indexOf("Today's logbook"));
  assert.ok(text.indexOf("merged #4001 delivered") < text.indexOf("Ticket 10"));
});
