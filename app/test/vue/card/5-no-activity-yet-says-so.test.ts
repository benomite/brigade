// #3923, critère 5 : une carte sans activité connue dit un texte neutre clair — ni vide, ni erreur.
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
const card = (ticket: number, state: string, plus: object = {}) => ({ ticket, etat: state, titre: `Ticket ${ticket}`, url: `https://github.com/chef/parade/issues/${ticket}`, ...plus });

// Ouvre le projet et lui donne une lecture : la voie par laquelle la cuisine suit le tableau.
async function ouvrir(rail: unknown[]): Promise<Jouee> {
  const vue = await jouerLaVue({ demarrage, espace: () => [], machines: () => [{ id: "poste", titre: "this computer" }] } as never);
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  const demandes = vue.appels.filter(({ geste: action }) => action === "faits" || action === "relireBox");
  const facts = { etat: "ouverte", lu: LU, dernierTick: LU, compteurs: { rail: rail.length, auTravail: rail.length, aLaPass: 0, attend: 0, livres24h: 0 }, dernierEvenement: null, rail, cooks: [], attend: [] };
  const recue = holdFacts(() => new Map()).recevoir({ projet: "parade", demande: 0, a: LU, sorties: [{ commande: "facts", texte: JSON.stringify(facts) }] });
  vue.dire("surFaits", { ...recue, demande: demandes.at(-1)?.args[0] as number });
  await repos();
  return vue;
}
const texte = (vue: Jouee, numero: number): string => (cardDuTicket(vue, numero) ?? assert.fail(`pas de bon #${numero}`)).textContent;

const NEUTRE = /no activity yet/i;
const ERROR = /error|undefined|null|NaN|failed|unavailable/i;

for (const state of ["pris", "en pass"]) {
  test(`a ${state} card with no known activity says so, neutrally`, async () => {
    const vue = await ouvrir([card(30, state, { activite: null })]);
    assert.match(texte(vue, 30), NEUTRE, texte(vue, 30));
    assert.doesNotMatch(texte(vue, 30), ERROR, texte(vue, 30));
  });
}

test("a card whose runtime gives no activity field at all says the same", async () => {
  const vue = await ouvrir([card(31, "pris")]);
  assert.match(texte(vue, 31), NEUTRE, texte(vue, 31));
  assert.doesNotMatch(texte(vue, 31), ERROR, texte(vue, 31));
});
