// #3884, critère 1 : une carte `taken` sans cook qui cuit ni attente chronométrée dit « Taken, no cook running ».
// Test d'acceptation gelé. La vue est jouée telle qu'elle est, devant un faux document (helpers/false-vue.ts).
import assert from "node:assert/strict";
import { test } from "node:test";
import { forTheBar } from "../../src/bar.ts";
import { EXAMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/colors.ts";
import { BANNER, holdFacts } from "../../src/facts.ts";
import { TABS, HEADINGS } from "../../src/tabs.ts";
import { EFFORTS, MODELS } from "../../src/projects/projects.ts";
import { cardOfTicket, playTheVue, repos, type Played } from "../helpers/false-vue.ts";

const A = "2026-11-19T12:04:12.000Z";
const LABEL = "Taken, no cook running";
const startup = () => ({
  configuration: forTheBar({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE,
  exemple: EXAMPLE,
  onglets: TABS,
  rubriques: HEADINGS,
  gestes: {},
  banniere: BANNER,
  calibrage: { modeles: MODELS, efforts: EFFORTS },
  code: undefined,
});
const taken = (ticket: number, more: object = {}) => ({ ticket, etat: "pris", titre: `Ticket ${ticket}`, url: `https://github.com/chef/parade/issues/${ticket}`, activite: null, ...more });

async function open(rail: unknown[], cooks: unknown[]): Promise<Played> {
  const facts = { etat: "ouverte", lu: "2026-11-19T12:04:11.000Z", dernierTick: "2026-11-19T12:04:11.000Z", compteurs: { rail: rail.length, auTravail: rail.length, aLaPass: 0, attend: 0, livres24h: 0 }, dernierEvenement: null, rail, cooks, attend: [] };
  const vue = await playTheVue({ demarrage: startup, espace: () => [], machines: () => [{ id: "poste", titre: "this computer" }] } as never);
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  const requests = vue.appels.filter(({ geste: action }) => action === "faits" || action === "relireBox");
  const receivedOne = holdFacts(() => new Map()).recevoir({ projet: "parade", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(facts) }] });
  vue.dire("surFaits", { ...receivedOne, demande: requests.at(-1)?.args[0] as number });
  await repos();
  return vue;
}
const text = (vue: Played, number: number): string => (cardOfTicket(vue, number) ?? assert.fail(`pas de bon #${number}`)).textContent;

test("a taken card with no running cook and no live wait says it on the rail", async () => {
  const vue = await open([taken(14)], []);
  assert.ok(text(vue, 14).includes(LABEL), text(vue, 14));
});

// #3884, critère 2 : une carte `taken` dont un cook cuit ne dit pas ce mot ; sa voisine sans cook le dit.
// Test d'acceptation gelé. La vue est jouée telle qu'elle est, devant un faux document (helpers/false-vue.ts).
// brigade:guard — moved unchanged from its own file by the closing pass #4074: it keeps guarding what main already does.
test("a taken card with a running cook does not say it, while its cookless neighbour does", async () => {
  const vue = await open([taken(14), taken(22)], [{ ticket: 14, titre: "Ticket 14", station: "parade-box" }]);
  assert.equal(text(vue, 14).includes(LABEL), false, text(vue, 14));
  assert.ok(text(vue, 22).includes(LABEL), text(vue, 22));
});

// #3884, critère 3 : une carte `taken` en attente chronométrée vivante ne dit pas ce mot et garde son attente ; sa voisine sans attente le dit.
// Test d'acceptation gelé. La vue est jouée telle qu'elle est, devant un faux document (helpers/false-vue.ts).
// brigade:guard — moved unchanged from its own file by the closing pass #4074: it keeps guarding what main already does.
test("a taken card with a live timed wait does not say it and keeps its wait, while its neighbour does", async () => {
  const wait = { raison: "attend : quota du compte épuisé", colonne: "pris", retour: "2026-11-19T13:30:00.000Z" };
  const vue = await open([taken(14, { attente: wait }), taken(22)], []);
  assert.equal(text(vue, 14).includes(LABEL), false, text(vue, 14));
  assert.ok(text(vue, 14).includes("quota du compte épuisé"), text(vue, 14));
  assert.ok(text(vue, 22).includes(LABEL), text(vue, 22));
});
