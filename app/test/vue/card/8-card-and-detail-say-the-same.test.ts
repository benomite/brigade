// #4076, critère 3 : la carte et la fiche disent la même chose de qui cuit et de ce qui se passe.
// Test d'acceptation gelé. La vue est jouée telle qu'elle est, devant un faux document (helpers/false-vue.ts).
import assert from "node:assert/strict";
import { test } from "node:test";
import { forTheBar } from "../../../src/bar.ts";
import { EXAMPLE } from "../../../src/config.ts";
import { PALETTE } from "../../../src/colors.ts";
import { holdFacts } from "../../../src/facts.ts";
import { TABS, HEADINGS } from "../../../src/tabs.ts";
import { EFFORTS, MODELS } from "../../../src/projects/projects.ts";
import { activitiesPublished, type ActivityOfCook } from "../../../src/board/read.ts";
import { cardOfTicket, playTheVue, repos, type Played } from "../../helpers/false-vue.ts";

const A = "2026-11-23T15:45:00.000Z";
const startup = () => ({
  configuration: forTheBar({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE,
  exemple: EXAMPLE,
  onglets: TABS,
  rubriques: HEADINGS,
  gestes: {},
  calibrage: { modeles: MODELS, efforts: EFFORTS },
  });
const STATION = "parade-box/claude";
// What a GitHub-only project gives (#4076): the rail line names the station but carries no `activite`, while the cook's own
// activity (what its detail reads) says it is writing.
const card = (ticket: number, state: string) => ({ ticket, etat: state, titre: `Ticket ${ticket}`, url: `https://github.com/chef/parade/issues/${ticket}`, station: STATION, activite: null });
const cook = (ticket: number): ActivityOfCook => ({
  ticket,
  titre: `Ticket ${ticket}`,
  run: `${ticket}-aa`,
  station: STATION,
  lanceLe: "2026-11-23T15:44:00.000Z",
  finiLe: null,
  fin: null,
  maintenant: { fait: "writing", faitEn: "writing", cible: "app/src/bon.ts", depuis: "2026-11-23T15:44:40.000Z" },
  etapes: [],
  tours: 3,
  tokens: 1000,
  pr: null,
});

async function open(rail: ReturnType<typeof card>[], cooks: ActivityOfCook[]): Promise<Played> {
  const vue = await playTheVue({ demarrage: startup, espace: () => [], machines: () => [{ id: "poste", titre: "this computer" }], ouvrirPrDuCook: () => true } as never);
  (vue.element("projets").children.at(1) ?? assert.fail("no project entry")).click();
  await repos();
  const requests = vue.appels.filter(({ geste: action }) => action === "faits" || action === "relireBox");
  const facts = { etat: "ouverte", lu: A, compteurs: { rail: rail.length, auTravail: rail.length, aLaPass: 0, attend: 0, livres24h: 0 }, rail, cooks: [], attend: [] };
  const receivedOne = holdFacts(() => new Map()).recevoir({ projet: "parade", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(facts) }] });
  vue.dire("surFaits", { ...receivedOne, demande: requests.at(-1)?.args[0] as number });
  await repos();
  vue.dire("surActivites", activitiesPublished("parade", { lu: true, depot: "chef/parade", luLe: A, cuisine: { rubriques: [] }, faits: {}, file: [], bilans: [], lignesDuRail: [], activites: cooks }));
  await repos();
  return vue;
}
const text = (vue: Played, number: number): string => (cardOfTicket(vue, number) ?? assert.fail(`no card #${number}`)).textContent;

test("card and detail name the same station and the same activity", async () => {
  const vue = await open([card(4064, "pris")], [cook(4064)]);
  (cardOfTicket(vue, 4064) ?? assert.fail("no card")).click();
  await repos();
  const detail = vue.element("fiche");
  assert.equal(detail.hidden, false);
  const theCard = text(vue, 4064);
  const theDetail = detail.textContent;
  assert.match(theDetail, /parade-box/, theDetail);
  assert.match(theDetail, /writing app\/src\/bon\.ts/, theDetail);
  assert.match(theCard, /parade-box/, `card: ${theCard}`);
  assert.match(theCard, /writing app\/src\/bon\.ts/, `card: ${theCard}`);
  assert.doesNotMatch(theCard, /no activity yet/i, `card: ${theCard}`);
});
