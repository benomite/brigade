// #3923, critère 3 : une carte en pass dit son étape — CI running, review, waiting for main, merging — et sa fraîcheur.
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
const IT_Y_A = (seconds: number) => new Date(Date.parse(READ) - seconds * 1000).toISOString();
const startup = () => ({
  configuration: forTheBar({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE,
  exemple: EXAMPLE,
  onglets: TABS,
  rubriques: HEADINGS,
  gestes: {},
  calibrage: { modeles: MODELS, efforts: EFFORTS },
  });
const card = (ticket: number, state: string, more: object = {}) => ({ ticket, etat: state, titre: `Ticket ${ticket}`, url: `https://github.com/chef/parade/issues/${ticket}`, activite: null, ...more });
const activity = (doneIn: string, since: string) => ({ fait: doneIn, faitEn: doneIn, cible: null, depuis: since });

// Ouvre le projet et lui donne une lecture, à l'heure `lu` : la voie par laquelle la cuisine suit le tableau.
async function open(rail: unknown[]): Promise<Played> {
  const vue = await playTheVue({ demarrage: startup, espace: () => [], machines: () => [{ id: "poste", titre: "this computer" }] } as never);
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  const requests = vue.appels.filter(({ geste: action }) => action === "faits" || action === "relireBox");
  const facts = { etat: "ouverte", lu: READ, compteurs: { rail: rail.length, auTravail: 0, aLaPass: rail.length, attend: 0, livres24h: 0 }, rail, cooks: [], attend: [] };
  const receivedOne = holdFacts(() => new Map()).recevoir({ projet: "parade", demande: 0, a: READ, sorties: [{ commande: "facts", texte: JSON.stringify(facts) }] });
  vue.dire("surFaits", { ...receivedOne, demande: requests.at(-1)?.args[0] as number });
  await repos();
  return vue;
}
const text = (vue: Played, number: number): string => (cardOfTicket(vue, number) ?? assert.fail(`pas de bon #${number}`)).textContent;

for (const [step, age, said] of [
  ["CI running", 45, "45 s"],
  ["review", 12, "12 s"],
  ["waiting for main", 90, "1 min"],
  ["merging", 5, "5 s"],
] as const) {
  test(`a pass card says "${step}" and how fresh that step is`, async () => {
    const vue = await open([card(21, "en pass", { activite: activity(step, IT_Y_A(age)) })]);
    assert.ok(text(vue, 21).includes(`${step} · ${said} ago`), text(vue, 21));
  });
}
