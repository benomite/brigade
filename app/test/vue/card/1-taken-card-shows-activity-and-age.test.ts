// #3923, critère 1 : une carte taken dit ce que son cook fait et depuis quand — « running the tests · 20 s ago ».
// Test d'acceptation gelé. La vue est jouée telle qu'elle est, devant un faux document (aides/fausse-vue.ts) ; les faits sont ceux que le runtime donne dans `facts`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ALLUMAGE } from "../../../src/allumage.ts";
import { pourLaBar } from "../../../src/bar.ts";
import { EXEMPLE } from "../../../src/config.ts";
import { PALETTE } from "../../../src/couleurs.ts";
import { KITCHEN_ACTIONS } from "../../../src/kitchen.ts";
import { BANNIERE, holdFacts } from "../../../src/facts.ts";
import { CONFIRMES, DIRECTS } from "../../../src/actions.ts";
import { ONGLETS, RUBRIQUES } from "../../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../../src/projects/projects.ts";
import { cardDuTicket, jouerLaVue, repos, type Jouee } from "../../aides/fausse-vue.ts";

const LU = "2026-11-19T12:04:30.000Z";
const IL_Y_A = (secondes: number) => new Date(Date.parse(LU) - secondes * 1000).toISOString();
const demarrage = () => ({
  configuration: pourLaBar({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: KITCHEN_ACTIONS, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
});
const card = (ticket: number, state: string, plus: object = {}) => ({ ticket, etat: state, titre: `Ticket ${ticket}`, url: `https://github.com/chef/parade/issues/${ticket}`, activite: null, ...plus });
const activity = (faitEn: string, depuis: string) => ({ fait: faitEn, faitEn, cible: null, depuis });

// Ouvre le projet et lui donne une lecture, à l'heure `lu` : la voie par laquelle la cuisine suit le tableau.
async function ouvrir(rail: unknown[]): Promise<{ vue: Jouee; lire: (rail: unknown[], lu: string) => Promise<void> }> {
  const vue = await jouerLaVue({ demarrage, espace: () => [], machines: () => [{ id: "poste", titre: "this computer" }] } as never);
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  const lire = async (lines: unknown[], lu: string) => {
    const demandes = vue.appels.filter(({ geste: action }) => action === "faits" || action === "relireBox");
    const facts = { etat: "ouverte", lu, dernierTick: lu, compteurs: { rail: lines.length, auTravail: lines.length, aLaPass: 0, attend: 0, livres24h: 0 }, dernierEvenement: null, rail: lines, cooks: [], attend: [] };
    const recue = holdFacts(() => new Map()).recevoir({ projet: "parade", demande: 0, a: lu, sorties: [{ commande: "facts", texte: JSON.stringify(facts) }] });
    vue.dire("surFaits", { ...recue, demande: demandes.at(-1)?.args[0] as number });
    await repos();
  };
  await lire(rail, LU);
  return { vue, lire };
}
const texte = (vue: Jouee, numero: number): string => (cardDuTicket(vue, numero) ?? assert.fail(`pas de bon #${numero}`)).textContent;

test("a taken card says what its cook does now and how fresh that is", async () => {
  const { vue } = await ouvrir([card(14, "pris", { activite: activity("running the tests", IL_Y_A(20)) })]);
  assert.ok(texte(vue, 14).includes("running the tests · 20 s ago"), texte(vue, 14));
});
