// Test d'acceptation gelé (#4238). Critère 1 : les colonnes se lisent, de gauche à droite : backlog, manager, cooks, pass, served — le rail en haut du backlog, les tickets prêts à part.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { EXEMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE, tenirFaits, type Faits } from "../../src/faits.ts";
import { gestesDeCarte } from "../../src/gestes-fiche.ts";
import { CONFIRMES, DIRECTS } from "../../src/gestes.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../src/projets/projets.ts";
import type { Terminal } from "../../src/terminaux.ts";
import { type Faux, type Jouee, jouerLaVue, repos } from "../aides/fausse-vue.ts";

const PARADE = "parade";
const A = "2026-11-25T09:00:00.000Z";
const url = (ticket: number) => `https://github.com/chef/parade/issues/${ticket}`;
const SECOND: Terminal = { id: 1, projet: PARADE, genre: "second", titre: "second · claude", note: "session neuve", arrete: false };
const demarrage = () => ({
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: PARADE, dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE, exemple: EXEMPLE, onglets: ONGLETS, rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE, calibrage: { modeles: MODELES, efforts: EFFORTS }, code: undefined,
});
async function ouvrir(): Promise<Jouee> {
  const vue = await jouerLaVue({ demarrage, espace: () => [SECOND], ouvrirIssue: () => true, gestesDeFiche: (carte) => gestesDeCarte(carte) });
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  return vue;
}
const carte = (ticket: number, etat: string, extra: object = {}) => ({ ticket, etat, titre: `Ticket ${ticket}`, url: url(ticket), activite: null, ...extra });
async function montrer(faits: Partial<Faits> & { rail: Faits["rail"] }, vue?: Jouee): Promise<Jouee> {
  const ouverte = vue ?? (await ouvrir());
  const complet: Faits = { etat: "ouverte", lu: A, dernierTick: A, compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, dernierEvenement: null, cooks: [], attend: [], ...faits };
  const recue = tenirFaits().recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(complet) }] });
  ouverte.dire("surFaits", { ...recue, demande: ouverte.dernier("faits")[0] as number });
  await repos();
  return ouverte;
}
const toutLeTexte = (vue: Jouee): string => vue.element("rail").textContent;
const titres = (el: Faux): string[] => el.dessous("h4").map((h) => h.textContent.trim());
const colonnes = (vue: Jouee): Faux[] => (vue.element("rail").children.find(({ className }) => className === "colonnes") ?? assert.fail("pas de colonnes")).children;
const colonne = (vue: Jouee, nom: RegExp): Faux => colonnes(vue).find((c) => nom.test(titres(c)[0] ?? "")) ?? assert.fail(`pas de colonne ${nom}`);
const numeros = (el: Faux): number[] => el.dessous("li").filter(({ dataset }) => dataset.ticket !== undefined).map(({ dataset }) => Number(dataset.ticket));

test("les colonnes : backlog, manager, cooks, pass, served ; le rail en tête du backlog, les prêts à part", async () => {
  const vue = await montrer({ rail: [carte(10, "en attente", { prete: true }), carte(11, "pris"), carte(12, "en pass"), carte(13, "servi")] });
  const noms = colonnes(vue).map((c) => (titres(c)[0] ?? "").toLowerCase());
  assert.deepEqual(noms.map((n) => /backlog/.test(n) ? "backlog" : /manager/.test(n) ? "manager" : /cook/.test(n) ? "cooks" : /pass/.test(n) ? "pass" : /served/.test(n) ? "served" : n), ["backlog", "manager", "cooks", "pass", "served"]);
  const backlog = colonne(vue, /backlog/i);
  const sections = backlog.children.map((c) => c.textContent.toLowerCase());
  assert.ok(sections.findIndex((t) => /\brail\b/.test(t)) >= 0, "the rail is at the top of the backlog");
  assert.ok(sections.findIndex((t) => /ready/.test(t)) >= 0, "the ready tickets are set apart in the backlog");
  assert.ok(sections.findIndex((t) => /\brail\b/.test(t)) <= sections.findIndex((t) => /ready/.test(t)));
});

// Critère 2 : chaque carte de ticket est dans la colonne de son étape.
test("chaque carte est dans la colonne de son étape", async () => {
  const vue = await montrer({ rail: [carte(10, "en attente"), carte(11, "pris"), carte(12, "en pass"), carte(13, "servi")] });
  assert.ok(numeros(colonne(vue, /backlog/i)).includes(10));
  assert.deepEqual(numeros(colonne(vue, /cook/i)), [11]);
  assert.deepEqual(numeros(colonne(vue, /pass/i)), [12]);
  assert.deepEqual(numeros(colonne(vue, /served/i)), [13]);
  assert.ok(!numeros(colonne(vue, /manager/i)).some((n) => [10, 11, 12, 13].includes(n)));
});
