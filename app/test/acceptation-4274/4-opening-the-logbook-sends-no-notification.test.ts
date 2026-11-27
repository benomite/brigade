// Test d'acceptation (#4274). Critère 4 : ouvrir la vue du projet ou le journal ne déclenche aucune notification.
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
import { holdNotifications } from "../../src/notification.ts";
import { type Played, playTheVue, repos } from "../helpers/false-vue.ts";

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
// Le journal et le digest viennent des faits du projet (`fils`, `digest`), comme le reste de la vue.
async function openWith(extra: object): Promise<Played> {
  const vue = await playTheVue({ demarrage: startup, espace: () => [SECOND], ouvrirIssue: () => true, gestesDeFiche: (card) => actionsOfCard(card) });
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  const complete = { etat: "ouverte", lu: A, dernierTick: A, compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, dernierEvenement: null, cooks: [], attend: [], rail: [{ ticket: 10, etat: "en attente", titre: "Ticket 10", url: "https://github.com/chef/parade/issues/10", activite: null }], ...extra } as unknown as Facts;
  const receivedOne = holdFacts().recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(complete) }] });
  vue.dire("surFaits", { ...receivedOne, demande: vue.dernier("faits")[0] as number });
  await repos();
  return vue;
}



test("opening the project view with a logbook and a digest triggers no notification", async () => {
  const shown: unknown[] = [];
  const extra = { fils: { cook: [action("merged #4001 delivered", "delivered", "fixed by itself")], supervisor: [action("main went red", "broke", "not done"), action("reran main, now green", "fixed", "fixed by itself"), action("zone cycle stuck", "unfixed", "handed to the chef"), action("released a ticket by mistake", "mistake", "fixed by itself")] }, digest: "0 outages seen first by the chef" };
  const vue = await openWith(extra);
  assert.ok(vue.element("rail").textContent.includes("zone cycle stuck"), "the logbook is open");
  assert.equal(vue.appels.filter(({ geste: action }) => /notif/i.test(action)).length, 0, "the view asks for no notification");
  const notifications = holdNotifications({ montrer: (n) => shown.push(n), ouvrir: () => {}, memoire: { lire: () => ({}), ecrire: () => {} } });
  assert.equal(notifications.recevoir(PARADE, extra as unknown as Facts), undefined);
  assert.deepEqual(shown, []);
});
