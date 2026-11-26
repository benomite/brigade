// La vue du projet avec son journal du jour et la carte du digest de la veille (ticket 4274), jouée entière : la carte en
// tête à la première ouverture du jour seulement, le journal au-dessus des colonnes.
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
import { FauxStockage, type Jouee, jouerLaVue, repos } from "../aides/fausse-vue.ts";

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
// Le journal et le digest viennent des faits du projet (`fils`, `digest`), comme le reste de la vue ; le stockage de la vue
// garde le jour où la carte du matin s'est montrée, d'une ouverture de l'app à l'autre.
async function ouvrirAvec(extra: object, stockage: FauxStockage): Promise<Jouee> {
  const vue = await jouerLaVue({ demarrage, espace: () => [SECOND], ouvrirIssue: () => true, gestesDeFiche: (card) => actionsDeCard(card) }, { stockage });
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  const complet = { etat: "ouverte", lu: A, dernierTick: A, compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, dernierEvenement: null, cooks: [], attend: [], rail: [{ ticket: 10, etat: "en attente", titre: "Ticket 10", url: "https://github.com/chef/parade/issues/10", activite: null }], ...extra } as unknown as Facts;
  const recue = holdFacts().recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(complet) }] });
  vue.dire("surFaits", { ...recue, demande: vue.dernier("faits")[0] as number });
  await repos();
  return vue;
}

test("the digest card shows at the first opening of the day only: the app opened again the same day shows the logbook without it", async () => {
  const stockage = new FauxStockage();
  const extra = { fils: { cook: [action("merged #4001 delivered", "delivered", "merged")] }, digest: "1 outage seen first by the chef" };
  const first = await ouvrirAvec(extra, stockage);
  const rail = first.element("rail");
  assert.equal(rail.children[0]?.ariaLabel, "Yesterday", "the card is the first thing of the view");
  assert.match(rail.textContent, /1 outage seen first by the chef/);
  const seconde = await ouvrirAvec(extra, stockage);
  assert.doesNotMatch(seconde.element("rail").textContent, /outage seen first by the chef/);
  assert.match(seconde.element("rail").textContent, /Today's logbook.*merged #4001 delivered/);
});

test("the logbook sits above the columns of the rail, the digest card above all", async () => {
  const vue = await ouvrirAvec({ fils: { cook: [action("merged #4001 delivered", "delivered", "merged")] }, digest: "0 outages seen first by the chef" }, new FauxStockage());
  const texte = vue.element("rail").textContent;
  assert.ok(texte.indexOf("0 outages seen first by the chef") < texte.indexOf("Today's logbook"));
  assert.ok(texte.indexOf("merged #4001 delivered") < texte.indexOf("Ticket 10"));
});
