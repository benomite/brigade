// #3923, critère 5 : une carte sans activité connue dit un texte neutre clair — ni vide, ni erreur.
// Test d'acceptation gelé. La vue est jouée telle qu'elle est, devant un faux document (helpers/false-vue.ts) ; les faits sont ceux que le runtime donne dans `facts`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { forTheBar } from "../../../src/bar.ts";
import { EXAMPLE } from "../../../src/config.ts";
import { PALETTE } from "../../../src/colors.ts";
import { holdFacts } from "../../../src/facts.ts";
import { TABS, HEADINGS } from "../../../src/tabs.ts";
import { EFFORTS, MODELS } from "../../../src/projects/projects.ts";
import { cardOfTicket, playTheVue, repos, type Played } from "../../helpers/false-vue.ts";

const READ = "2026-11-19T12:04:30.000Z";
const startup = () => ({
  configuration: forTheBar({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE,
  exemple: EXAMPLE,
  onglets: TABS,
  rubriques: HEADINGS,
  gestes: {},
  calibrage: { modeles: MODELS, efforts: EFFORTS },
  });
const card = (ticket: number, state: string, more: object = {}) => ({ ticket, etat: state, titre: `Ticket ${ticket}`, url: `https://github.com/chef/parade/issues/${ticket}`, ...more });

// Ouvre le projet et lui donne une lecture : la voie par laquelle la cuisine suit le tableau.
async function open(rail: unknown[]): Promise<Played> {
  const vue = await playTheVue({ demarrage: startup, espace: () => [], machines: () => [{ id: "poste", titre: "this computer" }] } as never);
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  const requests = vue.appels.filter(({ geste: action }) => action === "faits" || action === "relireBox");
  const facts = { etat: "ouverte", lu: READ, compteurs: { rail: rail.length, auTravail: rail.length, aLaPass: 0, attend: 0, livres24h: 0 }, rail, cooks: [], attend: [] };
  const receivedOne = holdFacts(() => new Map()).recevoir({ projet: "parade", demande: 0, a: READ, sorties: [{ commande: "facts", texte: JSON.stringify(facts) }] });
  vue.dire("surFaits", { ...receivedOne, demande: requests.at(-1)?.args[0] as number });
  await repos();
  return vue;
}
const text = (vue: Played, number: number): string => (cardOfTicket(vue, number) ?? assert.fail(`pas de bon #${number}`)).textContent;

const NEUTRAL = /no activity yet/i;
const ERROR = /error|undefined|null|NaN|failed|unavailable/i;

for (const state of ["pris", "en pass"]) {
  test(`a ${state} card with no known activity says so, neutrally`, async () => {
    const vue = await open([card(30, state, { activite: null })]);
    assert.match(text(vue, 30), NEUTRAL, text(vue, 30));
    assert.doesNotMatch(text(vue, 30), ERROR, text(vue, 30));
  });
}

test("a card whose runtime gives no activity field at all says the same", async () => {
  const vue = await open([card(31, "pris")]);
  assert.match(text(vue, 31), NEUTRAL, text(vue, 31));
  assert.doesNotMatch(text(vue, 31), ERROR, text(vue, 31));
});
