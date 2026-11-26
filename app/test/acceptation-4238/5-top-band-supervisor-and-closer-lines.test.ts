// Test d'acceptation de #4238, critère 5, revu par #4354 : la bande du haut montre le supervisor et le closer en petites cartes
// sur une ligne — son nom, un point d'état, deux ou trois mots — et leur détail s'ouvre d'un clic ; aucune phrase.
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

test("la bande du haut porte une carte du supervisor et une du closer, leur détail à un clic", async () => {
  const vue = await show({
    rail: [card(31, "pris")],
    rolesCuisine: [
      { role: "supervisor", does: "watches the whole kitchen", latest: { what: "parked #31 for the chef", ticket: 31, at: "2026-11-25T08:30:00Z" } },
      { role: "closer", does: "tidies what is served", latest: { what: "removed dead code", ticket: null, at: "2026-11-25T06:00:00Z" } },
    ],
  });
  const bande = vue.element("rail").children.find(({ className }) => className === "bande-du-haut") ?? assert.fail("pas de bande du haut");
  const cards = bande.dessous("button");
  assert.deepEqual(cards.map(({ dataset }) => dataset.agent), ["supervisor", "closer"]);
  assert.match(cards[0]?.textContent ?? "", /^supervisorok$/);
  assert.match(cards[1]?.textContent ?? "", /^closertidied \d+ (min|h|d) ago$/);
  assert.deepEqual(bande.dessous("p"), [], "aucune phrase tant que rien n'est ouvert");
  cards[0]?.click();
  assert.match(bande.dessous("p")[0]?.textContent ?? "", /watches the whole kitchen · last: parked #31 for the chef/);
});
