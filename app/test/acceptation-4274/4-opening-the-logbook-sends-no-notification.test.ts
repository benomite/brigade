// Test d'acceptation (#4274). Critère 4 : ouvrir la vue du projet ou le journal ne déclenche aucune notification.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBar } from "../../src/bar.ts";
import { EXEMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { KITCHEN_ACTIONS } from "../../src/kitchen.ts";
import { BANNIERE, holdFacts, type Facts } from "../../src/facts.ts";
import { actionsDeCard } from "../../src/card-actions.ts";
import { CONFIRMES, DIRECTS } from "../../src/actions.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../src/projects/projects.ts";
import type { Terminal } from "../../src/terminaux.ts";
import { holdNotifications } from "../../src/notification.ts";
import { type Jouee, jouerLaVue, repos } from "../aides/fausse-vue.ts";

const PARADE = "parade";
const A = new Date().toISOString();
const SECOND: Terminal = { id: 1, projet: PARADE, genre: "second", titre: "second · claude", note: "session neuve", arrete: false };
const action = (line: string, kind: string, outcome: string) => ({ at: A, line, reason: "r", outcome, kind });
const demarrage = () => ({
  configuration: pourLaBar({ chemin: "/tmp/app.json", projets: [{ nom: PARADE, dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE, exemple: EXEMPLE, onglets: ONGLETS, rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: KITCHEN_ACTIONS, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE, calibrage: { modeles: MODELES, efforts: EFFORTS }, code: undefined,
});
// Le journal et le digest viennent des faits du projet (`fils`, `digest`), comme le reste de la vue.
async function ouvrirAvec(extra: object): Promise<Jouee> {
  const vue = await jouerLaVue({ demarrage, espace: () => [SECOND], ouvrirIssue: () => true, gestesDeFiche: (card) => actionsDeCard(card) });
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  const complet = { etat: "ouverte", lu: A, dernierTick: A, compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, dernierEvenement: null, cooks: [], attend: [], rail: [{ ticket: 10, etat: "en attente", titre: "Ticket 10", url: "https://github.com/chef/parade/issues/10", activite: null }], ...extra } as unknown as Facts;
  const recue = holdFacts().recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(complet) }] });
  vue.dire("surFaits", { ...recue, demande: vue.dernier("faits")[0] as number });
  await repos();
  return vue;
}



test("opening the project view with a logbook and a digest triggers no notification", async () => {
  const montrees: unknown[] = [];
  const extra = { fils: { cook: [action("merged #4001 delivered", "delivered", "fixed by itself")], supervisor: [action("main went red", "broke", "not done"), action("reran main, now green", "fixed", "fixed by itself"), action("zone cycle stuck", "unfixed", "handed to the chef"), action("released a ticket by mistake", "mistake", "fixed by itself")] }, digest: "0 outages seen first by the chef" };
  const vue = await ouvrirAvec(extra);
  assert.ok(vue.element("rail").textContent.includes("zone cycle stuck"), "the logbook is open");
  assert.equal(vue.appels.filter(({ geste: action }) => /notif/i.test(action)).length, 0, "the view asks for no notification");
  const notifications = holdNotifications({ montrer: (n) => montrees.push(n), ouvrir: () => {}, memoire: { lire: () => ({}), ecrire: () => {} } });
  assert.equal(notifications.recevoir(PARADE, extra as unknown as Facts), undefined);
  assert.deepEqual(montrees, []);
});
