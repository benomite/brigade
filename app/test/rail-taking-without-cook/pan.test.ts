// #3884 : la carte `taken` sans cook ne montre pas la poêle « ça cuit » ; celle dont un cook cuit la garde.
// Même fausse vue que les tests d'acceptation gelés (helpers/false-vue.ts).
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

const pans = (vue: Played, number: number) => (cardOfTicket(vue, number) ?? assert.fail(`pas de bon #${number}`)).dessous("span").filter(({ className }) => className === "poele").length;

test("a taken card with no cook running has no pan; its neighbour with a cook keeps it", async () => {
  const vue = await open([taken(14), taken(22)], [{ ticket: 14, titre: "Ticket 14", station: "parade-box" }]);
  assert.equal(pans(vue, 14), 1);
  assert.equal(pans(vue, 22), 0);
});
