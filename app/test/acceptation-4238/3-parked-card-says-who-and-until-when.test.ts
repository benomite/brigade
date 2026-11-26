// Test d'acceptation gelé (#4238). Critère 3 : une carte parked, dans la colonne où elle attend, dit qui elle attend et jusqu'à quand.
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
import { type Faux, type Jouee, jouerLaVue, repos } from "../aides/fausse-vue.ts";

const PARADE = "parade";
const A = "2026-11-25T09:00:00.000Z";
const url = (ticket: number) => `https://github.com/chef/parade/issues/${ticket}`;
const SECOND: Terminal = { id: 1, projet: PARADE, genre: "second", titre: "second · claude", note: "session neuve", arrete: false };
const demarrage = () => ({
  configuration: pourLaBar({ chemin: "/tmp/app.json", projets: [{ nom: PARADE, dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE, exemple: EXEMPLE, onglets: ONGLETS, rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: KITCHEN_ACTIONS, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE, calibrage: { modeles: MODELES, efforts: EFFORTS }, code: undefined,
});
async function ouvrir(): Promise<Jouee> {
  const vue = await jouerLaVue({ demarrage, espace: () => [SECOND], ouvrirIssue: () => true, gestesDeFiche: (card) => actionsDeCard(card) });
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  return vue;
}
const card = (ticket: number, state: string, extra: object = {}) => ({ ticket, etat: state, titre: `Ticket ${ticket}`, url: url(ticket), activite: null, ...extra });
async function show(facts: Partial<Facts> & { rail: Facts["rail"] }, vue?: Jouee): Promise<Jouee> {
  const ouverte = vue ?? (await ouvrir());
  const complet: Facts = { etat: "ouverte", lu: A, dernierTick: A, compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, dernierEvenement: null, cooks: [], attend: [], ...facts };
  const recue = holdFacts().recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(complet) }] });
  ouverte.dire("surFaits", { ...recue, demande: ouverte.dernier("faits")[0] as number });
  await repos();
  return ouverte;
}
const toutLeTexte = (vue: Jouee): string => vue.element("rail").textContent;
const titres = (el: Faux): string[] => el.dessous("h4").map((h) => h.textContent.trim());
const colonnes = (vue: Jouee): Faux[] => (vue.element("rail").children.find(({ className }) => className === "colonnes") ?? assert.fail("pas de colonnes")).children;
const colonne = (vue: Jouee, name: RegExp): Faux => colonnes(vue).find((c) => name.test(titres(c)[0] ?? "")) ?? assert.fail(`pas de colonne ${name}`);
const numeros = (el: Faux): number[] => el.dessous("li").filter(({ dataset }) => dataset.ticket !== undefined).map(({ dataset }) => Number(dataset.ticket));

test("la carte parked reste dans sa colonne, dit qui elle attend et jusqu'à quand", async () => {
  const tiers = { quoi: "the invoice", qui: "Camille", depuis: "2026-11-24T10:00:00Z", relance: "2026-11-28T09:00:00Z", aLArrivee: "goes on" };
  const vue = await show({ rail: [card(21, "pris", { tiers }), card(22, "pris")] });
  const cooks = colonne(vue, /cook/i);
  assert.ok(numeros(cooks).includes(21), "the parked card stays in the column where it waits");
  const slip = cooks.dessous("li").find(({ dataset }) => dataset.ticket === "21") ?? assert.fail("pas de carte");
  const dit = slip.textContent;
  assert.match(dit, /parked/i);
  assert.match(dit, /Camille/);
  assert.match(dit, /28|Nov/i);
  assert.doesNotMatch((cooks.dessous("li").find(({ dataset }) => dataset.ticket === "22") ?? assert.fail("pas de carte")).textContent, /parked|Camille/i);
});
