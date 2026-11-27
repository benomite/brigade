// #3923 : ce qu'une carte prise ou en pass dit de ce que la cuisine en fait — le geste, ou l'étape de la pass que le runtime
// donne (`activite.etape`), son âge suivi de « ago » —, et le rang d'un essai qui n'est pas le premier.
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
import { tellActivity } from "../../../src/vue/card/activity.ts";
import { setRankOfTrial } from "../../../src/vue/card/trial.js";
import { cardOfTicket, playTheVue, repos, type Played } from "../../helpers/false-vue.ts";

test("the step of the pass, when the runtime gives one, is said instead of what the pass does, without its target", () => {
  assert.equal(tellActivity({ faitEn: "judging", etape: "CI running", cible: "ci.yml" }, "45 s"), "CI running · 45 s ago");
  assert.equal(tellActivity({ faitEn: "judging", cible: "ci.yml" }, "45 s"), "judging ci.yml · 45 s ago");
  assert.equal(tellActivity({ faitEn: "reading", cible: null }, "3 s"), "reading · 3 s ago");
  assert.equal(tellActivity({ cible: null }, "3 s"), null);
  assert.equal(tellActivity(null, ""), null);
  assert.equal(tellActivity(undefined, ""), null);
});

test("the rank of a try reads as an English ordinal", () => {
  const doc = { createElement: () => ({ className: "", textContent: "" }) } as never;
  assert.deepEqual(setRankOfTrial(doc, 3), { className: "rang-essai", textContent: "3rd try" });
  assert.deepEqual(
    [2, 4, 10, 11, 12, 13, 21, 22, 23, 101, 111, 112].map((n) => setRankOfTrial(doc, n).textContent),
    ["2nd try", "4th try", "10th try", "11th try", "12th try", "13th try", "21st try", "22nd try", "23rd try", "101st try", "111th try", "112th try"],
  );
});

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
const card = (ticket: number, state: string, activity: object) => ({ ticket, etat: state, titre: `Ticket ${ticket}`, url: `https://github.com/chef/parade/issues/${ticket}`, activite: activity });

// Le projet ouvert, et une lecture de `facts` reçue : la voie par laquelle la cuisine suit le tableau.
async function open(rail: unknown[]): Promise<Played> {
  const vue = await playTheVue({ demarrage: startup, espace: () => [], machines: () => [{ id: "poste", titre: "this computer" }] } as never);
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  const requests = vue.appels.filter(({ geste: action }) => action === "faits" || action === "relireBox");
  const facts = { etat: "ouverte", lu: READ, dernierTick: READ, compteurs: { rail: rail.length, auTravail: 1, aLaPass: 1, attend: 0, livres24h: 0 }, dernierEvenement: null, rail, cooks: [], attend: [] };
  const receivedOne = holdFacts(() => new Map()).recevoir({ projet: "parade", demande: 0, a: READ, sorties: [{ commande: "facts", texte: JSON.stringify(facts) }] });
  vue.dire("surFaits", { ...receivedOne, demande: requests.at(-1)?.args[0] as number });
  await repos();
  return vue;
}
const text = (vue: Played, number: number): string => (cardOfTicket(vue, number) ?? assert.fail(`pas de bon #${number}`)).textContent;

test("a pass card shows the step facts gives, and a thinking cook says so on its card", async () => {
  const vue = await open([
    card(21, "en pass", { fait: "jugement en cours", faitEn: "judging", cible: "ci.yml", depuis: IT_Y_A(45), etape: "CI running" }),
    card(14, "pris", { fait: "réfléchit", faitEn: "thinking", cible: null, depuis: IT_Y_A(4) }),
  ]);
  assert.ok(text(vue, 21).includes("CI running · 45 s ago"), text(vue, 21));
  assert.ok(!text(vue, 21).includes("judging"), text(vue, 21));
  assert.ok(text(vue, 14).includes("thinking · 4 s ago"), text(vue, 14));
});
