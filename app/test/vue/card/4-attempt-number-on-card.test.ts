// #3923, critère 4 : un ticket pris plus d'une fois porte son numéro d'essai (« 3rd try ») ; une première prise n'en porte pas.
// Test d'acceptation gelé. La vue est jouée telle qu'elle est, devant un faux document (helpers/false-vue.ts) ; les faits sont ceux que le runtime donne dans `facts`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { POWER_UP } from "../../../src/power-up.ts";
import { forTheBar } from "../../../src/bar.ts";
import { EXAMPLE } from "../../../src/config.ts";
import { PALETTE } from "../../../src/colors.ts";
import { KITCHEN_ACTIONS } from "../../../src/kitchen.ts";
import { BANNER, holdFacts } from "../../../src/facts.ts";
import { CONFIRMED, DIRECT } from "../../../src/actions.ts";
import { TABS, HEADINGS } from "../../../src/tabs.ts";
import { EFFORTS, MODELS } from "../../../src/projects/projects.ts";
import { cardOfTicket, playTheVue, repos, type Played } from "../../helpers/false-vue.ts";

const READ = "2026-11-19T12:04:30.000Z";
const IT_Y_A = (seconds: number) => new Date(Date.parse(READ) - seconds * 1000).toISOString();
const startup = () => ({
  configuration: forTheBar({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE,
  exemple: EXAMPLE,
  onglets: TABS,
  rubriques: HEADINGS,
  gestes: { allumage: POWER_UP, cuisine: KITCHEN_ACTIONS, directs: DIRECT, confirmes: CONFIRMED },
  banniere: BANNER,
  calibrage: { modeles: MODELS, efforts: EFFORTS },
  code: undefined,
});
const card = (ticket: number, state: string, more: object = {}) => ({ ticket, etat: state, titre: `Ticket ${ticket}`, url: `https://github.com/chef/parade/issues/${ticket}`, activite: null, ...more });
const activity = (doneEn: string, since: string) => ({ fait: doneEn, faitEn: doneEn, cible: null, depuis: since });

// Ouvre le projet et lui donne une lecture, à l'heure `lu` : la voie par laquelle la cuisine suit le tableau.
async function open(rail: unknown[]): Promise<Played> {
  const vue = await playTheVue({ demarrage: startup, espace: () => [], machines: () => [{ id: "poste", titre: "this computer" }] } as never);
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  const requests = vue.appels.filter(({ geste: action }) => action === "faits" || action === "relireBox");
  const facts = { etat: "ouverte", lu: READ, dernierTick: READ, compteurs: { rail: rail.length, auTravail: rail.length, aLaPass: 0, attend: 0, livres24h: 0 }, dernierEvenement: null, rail, cooks: [], attend: [] };
  const receivedOne = holdFacts(() => new Map()).recevoir({ projet: "parade", demande: 0, a: READ, sorties: [{ commande: "facts", texte: JSON.stringify(facts) }] });
  vue.dire("surFaits", { ...receivedOne, demande: requests.at(-1)?.args[0] as number });
  await repos();
  return vue;
}
const text = (vue: Played, number: number): string => (cardOfTicket(vue, number) ?? assert.fail(`pas de bon #${number}`)).textContent;

// Les essais du séjour d'un ticket pris, tels que le runtime les donne dans `facts` : le plus ancien d'abord.
const trial = (since: string, until: string | null) => ({ depuis: since, jusqua: until, arret: until === null ? null : "idle", enCours: until === null });
const TRIALS = [trial(IT_Y_A(3000), IT_Y_A(2500)), trial(IT_Y_A(2000), IT_Y_A(1500)), trial(IT_Y_A(100), null)];
const LABEL_OF_TRIAL = /\d(st|nd|rd|th) try/;

test('a ticket taken three times shows "3rd try" on its card', async () => {
  const vue = await open([card(14, "pris", { essais: TRIALS, activite: activity("running the tests", IT_Y_A(20)) })]);
  assert.ok(text(vue, 14).includes("3rd try"), text(vue, 14));
});

test('a ticket taken twice shows "2nd try"', async () => {
  const vue = await open([card(14, "pris", { essais: TRIALS.slice(1), activite: activity("running the tests", IT_Y_A(20)) })]);
  assert.ok(text(vue, 14).includes("2nd try"), text(vue, 14));
});

test("a first attempt shows no such label", async () => {
  const vue = await open([
    card(14, "pris", { essais: TRIALS.slice(2), activite: activity("running the tests", IT_Y_A(20)) }),
    card(15, "pris", { activite: activity("writing", IT_Y_A(8)) }),
  ]);
  assert.doesNotMatch(text(vue, 14), LABEL_OF_TRIAL);
  assert.doesNotMatch(text(vue, 15), LABEL_OF_TRIAL);
  assert.ok(text(vue, 14).includes("running the tests · 20 s ago"), text(vue, 14));
});
