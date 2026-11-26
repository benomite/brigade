// #3884 : la carte `taken` sans cook ne montre pas la poêle « ça cuit » ; celle dont un cook cuit la garde.
// Même fausse vue que les tests d'acceptation gelés (aides/fausse-vue.ts).
import assert from "node:assert/strict";
import { test } from "node:test";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBar } from "../../src/bar.ts";
import { EXEMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { KITCHEN_ACTIONS } from "../../src/kitchen.ts";
import { BANNIERE, holdFacts } from "../../src/facts.ts";
import { CONFIRMES, DIRECTS } from "../../src/actions.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../src/projects/projects.ts";
import { cardDuTicket, jouerLaVue, repos, type Jouee } from "../aides/fausse-vue.ts";

const A = "2026-11-19T12:04:12.000Z";
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
const taken = (ticket: number, plus: object = {}) => ({ ticket, etat: "pris", titre: `Ticket ${ticket}`, url: `https://github.com/chef/parade/issues/${ticket}`, activite: null, ...plus });

async function ouvrir(rail: unknown[], cooks: unknown[]): Promise<Jouee> {
  const facts = { etat: "ouverte", lu: "2026-11-19T12:04:11.000Z", dernierTick: "2026-11-19T12:04:11.000Z", compteurs: { rail: rail.length, auTravail: rail.length, aLaPass: 0, attend: 0, livres24h: 0 }, dernierEvenement: null, rail, cooks, attend: [] };
  const vue = await jouerLaVue({ demarrage, espace: () => [], machines: () => [{ id: "poste", titre: "this computer" }] } as never);
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  const demandes = vue.appels.filter(({ geste: action }) => action === "faits" || action === "relireBox");
  const recue = holdFacts(() => new Map()).recevoir({ projet: "parade", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(facts) }] });
  vue.dire("surFaits", { ...recue, demande: demandes.at(-1)?.args[0] as number });
  await repos();
  return vue;
}

const poeles = (vue: Jouee, numero: number) => (cardDuTicket(vue, numero) ?? assert.fail(`pas de bon #${numero}`)).dessous("span").filter(({ className }) => className === "poele").length;

test("a taken card with no cook running has no pan; its neighbour with a cook keeps it", async () => {
  const vue = await ouvrir([taken(14), taken(22)], [{ ticket: 14, titre: "Ticket 14", station: "parade-box" }]);
  assert.equal(poeles(vue, 14), 1);
  assert.equal(poeles(vue, 22), 0);
});
