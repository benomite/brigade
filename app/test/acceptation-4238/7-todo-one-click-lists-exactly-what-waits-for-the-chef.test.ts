// Test d'acceptation gelé (#4238). Critère 7 : le TODO du chef est à un clic au plus ; il liste exactement les tickets qui attendent le chef, parked compris.
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

test("le TODO, à un clic au plus, liste exactement ce qui attend le chef, parked compris", async () => {
  const tiers = { quoi: "your call", qui: "the chef", depuis: "2026-11-24T10:00:00Z", relance: "2026-11-28T09:00:00Z", aLArrivee: "goes on" };
  const vue = await montrer({
    rail: [carte(51, "pris", { tiers }), carte(52, "pris"), carte(53, "en pass")],
    attend: [{ ticket: 50, titre: "A question", url: url(50) }, { ticket: 51, titre: "Ticket 51", url: url(51) }],
  });
  const todo = [...vue.element("rail").descendants()].find(({ className, ariaLabel }) => className === "todo-du-rail" || /awaits you/i.test(ariaLabel));
  const ouvreur = [...vue.poses()].find((el) => el.balise === "button" && /todo/i.test(el.textContent + el.ariaLabel + el.title));
  if (ouvreur !== undefined) ouvreur.click();
  await repos();
  const liste = todo ?? [...vue.poses()].find(({ className, ariaLabel }) => /todo/i.test(className) || /todo|awaits you/i.test(ariaLabel)) ?? assert.fail("pas de TODO");
  const dit = [...new Set(liste.dessous("li").flatMap(({ dataset }) => (dataset.ticket === undefined ? [] : [Number(dataset.ticket)])))].sort();
  assert.deepEqual(dit, [50, 51]);
});
