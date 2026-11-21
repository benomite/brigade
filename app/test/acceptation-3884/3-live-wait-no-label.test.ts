// #3884, critère 3 : une carte `taken` en attente chronométrée vivante ne dit pas ce mot et garde son attente ; sa voisine sans attente le dit.
// Test d'acceptation gelé. La vue est jouée telle qu'elle est, devant un faux document (aides/fausse-vue.ts).
import assert from "node:assert/strict";
import { test } from "node:test";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { EXEMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE, tenirFaits } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../../src/gestes.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../src/projets/projets.ts";
import { carteDuTicket, jouerLaVue, repos, type Jouee } from "../aides/fausse-vue.ts";

const A = "2026-11-19T12:04:12.000Z";
const LABEL = "Taken, no cook running";
const demarrage = () => ({
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
});
const pris = (ticket: number, plus: object = {}) => ({ ticket, etat: "pris", titre: `Ticket ${ticket}`, url: `https://github.com/chef/parade/issues/${ticket}`, activite: null, ...plus });

async function ouvrir(rail: unknown[], cooks: unknown[]): Promise<Jouee> {
  const faits = { etat: "ouverte", lu: "2026-11-19T12:04:11.000Z", dernierTick: "2026-11-19T12:04:11.000Z", compteurs: { rail: rail.length, auTravail: rail.length, aLaPass: 0, attend: 0, livres24h: 0 }, dernierEvenement: null, rail, cooks, attend: [] };
  const vue = await jouerLaVue({ demarrage, espace: () => [], machines: () => [{ id: "poste", titre: "this computer" }] } as never);
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  const demandes = vue.appels.filter(({ geste }) => geste === "faits" || geste === "relireBox");
  const recue = tenirFaits(() => new Map()).recevoir({ projet: "parade", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(faits) }] });
  vue.dire("surFaits", { ...recue, demande: demandes.at(-1)?.args[0] as number });
  await repos();
  return vue;
}
const texte = (vue: Jouee, numero: number): string => (carteDuTicket(vue, numero) ?? assert.fail(`pas de bon #${numero}`)).textContent;

test("a taken card with a live timed wait does not say it and keeps its wait, while its neighbour does", async () => {
  const attente = { raison: "attend : quota du compte épuisé", colonne: "pris", retour: "2026-11-19T13:30:00.000Z" };
  const vue = await ouvrir([pris(14, { attente }), pris(22)], []);
  assert.equal(texte(vue, 14).includes(LABEL), false, texte(vue, 14));
  assert.ok(texte(vue, 14).includes("quota du compte épuisé"), texte(vue, 14));
  assert.ok(texte(vue, 22).includes(LABEL), texte(vue, 22));
});
