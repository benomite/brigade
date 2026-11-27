// #3923, critère 1 : une carte taken dit ce que son cook fait et depuis quand — « running the tests · 20 s ago ».
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
const activity = (doneIn: string, since: string) => ({ fait: doneIn, faitEn: doneIn, cible: null, depuis: since });

// Ouvre le projet et lui donne une lecture, à l'heure `lu` : la voie par laquelle la cuisine suit le tableau.
async function open(rail: unknown[]): Promise<{ vue: Played; lire: (rail: unknown[], readOne: string) => Promise<void> }> {
  const vue = await playTheVue({ demarrage: startup, espace: () => [], machines: () => [{ id: "poste", titre: "this computer" }] } as never);
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  const read = async (lines: unknown[], readOne: string) => {
    const requests = vue.appels.filter(({ geste: action }) => action === "faits" || action === "relireBox");
    const facts = { etat: "ouverte", lu: readOne, dernierTick: readOne, compteurs: { rail: lines.length, auTravail: lines.length, aLaPass: 0, attend: 0, livres24h: 0 }, dernierEvenement: null, rail: lines, cooks: [], attend: [] };
    const receivedOne = holdFacts(() => new Map()).recevoir({ projet: "parade", demande: 0, a: readOne, sorties: [{ commande: "facts", texte: JSON.stringify(facts) }] });
    vue.dire("surFaits", { ...receivedOne, demande: requests.at(-1)?.args[0] as number });
    await repos();
  };
  await read(rail, READ);
  return { vue, lire: read };
}
const text = (vue: Played, number: number): string => (cardOfTicket(vue, number) ?? assert.fail(`pas de bon #${number}`)).textContent;

test("a taken card says what its cook does now and how fresh that is", async () => {
  const { vue } = await open([card(14, "pris", { activite: activity("running the tests", IT_Y_A(20)) })]);
  assert.ok(text(vue, 14).includes("running the tests · 20 s ago"), text(vue, 14));
});
