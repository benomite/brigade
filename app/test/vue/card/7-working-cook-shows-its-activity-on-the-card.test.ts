// #4076, critère 2 : une carte taken dont le cook travaille dit ce qu'il fait (#3923), et ne dit jamais « no activity yet » quand sa fiche dit qu'il cuit.
// Test d'acceptation gelé. La vue est jouée telle qu'elle est, devant un faux document (aides/fausse-vue.ts).
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
import { activitiesPubliees, type ActivityDuCook } from "../../../src/tableau/read.ts";
import { cardDuTicket, jouerLaVue, repos, type Jouee } from "../../aides/fausse-vue.ts";

const A = "2026-11-23T15:45:00.000Z";
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
const STATION = "parade-box/claude";
// What a GitHub-only project gives (#4076): the rail line names the station but carries no `activite`, while the cook's own
// activity (what its detail reads) says it is writing.
const card = (ticket: number, state: string) => ({ ticket, etat: state, titre: `Ticket ${ticket}`, url: `https://github.com/chef/parade/issues/${ticket}`, station: STATION, activite: null });
const cook = (ticket: number): ActivityDuCook => ({
  ticket,
  titre: `Ticket ${ticket}`,
  run: `${ticket}-aa`,
  station: STATION,
  lanceLe: "2026-11-23T15:44:00.000Z",
  finiLe: null,
  fin: null,
  maintenant: { fait: "writing", faitEn: "writing", cible: "app/src/slip.ts", depuis: "2026-11-23T15:44:40.000Z" },
  etapes: [],
  tours: 3,
  tokens: 1000,
  pr: null,
});

async function ouvrir(rail: ReturnType<typeof card>[], cooks: ActivityDuCook[]): Promise<Jouee> {
  const vue = await jouerLaVue({ demarrage, espace: () => [], machines: () => [{ id: "poste", titre: "this computer" }], ouvrirPrDuCook: () => true } as never);
  (vue.element("projets").children.at(1) ?? assert.fail("no project entry")).click();
  await repos();
  const demandes = vue.appels.filter(({ geste: action }) => action === "faits" || action === "relireBox");
  const facts = { etat: "ouverte", lu: A, dernierTick: A, compteurs: { rail: rail.length, auTravail: rail.length, aLaPass: 0, attend: 0, livres24h: 0 }, dernierEvenement: null, rail, cooks: [], attend: [] };
  const recue = holdFacts(() => new Map()).recevoir({ projet: "parade", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(facts) }] });
  vue.dire("surFaits", { ...recue, demande: demandes.at(-1)?.args[0] as number });
  await repos();
  vue.dire("surActivites", activitiesPubliees("parade", { lu: true, depot: "chef/parade", luLe: A, cuisine: { rubriques: [] }, faits: {}, file: [], bilans: [], lignesDuRail: [], activites: cooks }));
  await repos();
  return vue;
}
const texte = (vue: Jouee, numero: number): string => (cardDuTicket(vue, numero) ?? assert.fail(`no card #${numero}`)).textContent;

test("a taken card whose cook is working says what it does, never 'no activity yet'", async () => {
  const vue = await ouvrir([card(4062, "pris")], [cook(4062)]);
  assert.match(texte(vue, 4062), /writing app\/src\/slip\.ts/, texte(vue, 4062));
  assert.doesNotMatch(texte(vue, 4062), /no activity yet/i, texte(vue, 4062));
});
