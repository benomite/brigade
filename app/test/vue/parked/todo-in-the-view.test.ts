// Test de la vue entière (ticket 4281), sur le harnais du test gelé de #4238.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ALLUMAGE } from "../../../src/allumage.ts";
import { pourLaBarre } from "../../../src/barre.ts";
import { EXEMPLE } from "../../../src/config.ts";
import { PALETTE } from "../../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../../src/cuisine.ts";
import { BANNIERE, tenirFaits, type Faits } from "../../../src/faits.ts";
import { gestesDeCarte } from "../../../src/gestes-fiche.ts";
import { CONFIRMES, DIRECTS } from "../../../src/gestes.ts";
import { ONGLETS, RUBRIQUES } from "../../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../../src/projets/projets.ts";
import type { Terminal } from "../../../src/terminaux.ts";
import { type Faux, type Jouee, jouerLaVue, repos } from "../../aides/fausse-vue.ts";

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
async function ouvrir(attente: () => { fait: string } | { refus: string }): Promise<Jouee> {
  const vue = await jouerLaVue({ demarrage, attente, espace: () => [SECOND], ouvrirIssue: () => true, gestesDeFiche: (carte) => gestesDeCarte(carte) });
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  return vue;
}
const carte = (ticket: number, etat: string, extra: object = {}) => ({ ticket, etat, titre: `Ticket ${ticket}`, url: url(ticket), activite: null, ...extra });
async function montrer(faits: Partial<Faits> & { rail: Faits["rail"] }, attente: () => { fait: string } | { refus: string }, vue?: Jouee): Promise<Jouee> {
  const ouverte = vue ?? (await ouvrir(attente));
  const complet: Faits = { etat: "ouverte", lu: A, dernierTick: A, compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, dernierEvenement: null, cooks: [], attend: [], ...faits };
  const recue = tenirFaits().recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(complet) }] });
  ouverte.dire("surFaits", { ...recue, demande: ouverte.dernier("faits")[0] as number });
  await repos();
  return ouverte;
}

// Le TODO parked du chef dans la vue (ticket 4281) : #51 et #52, parked pour le chef, y sont avec leurs boutons ; #50, qui
// l'attend sans être parked, y garde son entrée ; #53, parked pour Camille, n'y est pas. « back to the kitchen » renvoie #51
// par le pont, et le contrôle de park de #52 part par le même geste d'attente.
const pourLeChef = (quoi: string) => ({ quoi, qui: "the chef", depuis: "2026-11-24T10:00:00Z", relance: "2026-11-28T09:00:00Z", aLArrivee: "goes on" });
const FAITS = {
  rail: [carte(51, "pris", { tiers: pourLeChef("your call") }), carte(52, "en pass", { tiers: pourLeChef("the logo") }), carte(53, "pris", { tiers: { ...pourLeChef("the keys"), qui: "Camille" } })],
  attend: [{ ticket: 50, titre: "A question", url: url(50) }, { ticket: 51, titre: "Ticket 51", url: url(51) }, { ticket: 52, titre: "Ticket 52", url: url(52) }],
};
const todoDe = (vue: Jouee) => [...vue.element("rail").descendants()].find(({ className }) => className === "todo-du-rail") ?? assert.fail("pas de TODO");
const items = (vue: Jouee, classe: string) => todoDe(vue).dessous("li").filter(({ className }) => className === classe);
const attentes = (vue: Jouee) => vue.appels.filter(({ geste }) => geste === "attente").map(({ args }) => args);

test("the chef's TODO lists the parked tickets that wait for the chef, with who, for what, until when and their button", async () => {
  const vue = await montrer(FAITS, () => ({ fait: "posted" }));
  assert.equal(todoDe(vue).children[0]?.textContent, "TODO (3)");
  assert.deepEqual(items(vue, "entree-du-todo").map(({ dataset }) => Number(dataset.ticket)), [50]);
  const parques = items(vue, "parked-item");
  assert.deepEqual(parques.map(({ dataset }) => Number(dataset.ticket)), [51, 52]);
  assert.ok(parques[0]!.textContent.includes("your call") && parques[0]!.textContent.includes("2026-11-28"));
  parques[0]!.dessous("button").find((b) => b.textContent === "back to the kitchen")!.click();
  await repos();
  assert.deepEqual(attentes(vue), [[PARADE, "attente-arrivee", 51]]);
  assert.deepEqual(items(vue, "parked-item").map(({ dataset }) => Number(dataset.ticket)), [52]);
});

test("the park control of a TODO item parks it through the kitchen's waiting gesture, and says what came back", async () => {
  const vue = await montrer(FAITS, () => ({ refus: "nothing is written: the follow-up date is not a day" }));
  const item = () => items(vue, "parked-item").find(({ dataset }) => dataset.ticket === "52") ?? assert.fail("pas de #52");
  item().dessous("button").find(({ dataset }) => dataset.action === "open-park")!.click();
  await repos();
  const champ = (nom: string) => item().dessous("input").find(({ dataset }) => dataset.field === nom) ?? assert.fail(`pas de ${nom}`);
  champ("who").value = "Camille";
  champ("what").value = "the logo";
  champ("until").value = "the vendor answers";
  item().dessous("button").find(({ dataset }) => dataset.action === "park")!.click();
  await repos();
  assert.deepEqual(attentes(vue), [[PARADE, "attente-poser", 52, { quoi: "the logo", qui: "Camille", relance: "the vendor answers" }]]);
  assert.match(item().textContent, /not a day/);
});
