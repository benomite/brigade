// #3923 : ce qu'une carte prise ou en pass dit de ce que la cuisine en fait — le geste, ou l'étape de la pass que le runtime
// donne (`activite.etape`), son âge suivi de « ago » —, et le rang d'un essai qui n'est pas le premier.
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
import { tellActivity } from "../../../src/vue/card/activity.ts";
import { poserRangDTrial } from "../../../src/vue/card/trial.js";
import { cardDuTicket, jouerLaVue, repos, type Jouee } from "../../aides/fausse-vue.ts";

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
  assert.deepEqual(poserRangDTrial(doc, 3), { className: "rang-essai", textContent: "3rd try" });
  assert.deepEqual(
    [2, 4, 10, 11, 12, 13, 21, 22, 23, 101, 111, 112].map((n) => poserRangDTrial(doc, n).textContent),
    ["2nd try", "4th try", "10th try", "11th try", "12th try", "13th try", "21st try", "22nd try", "23rd try", "101st try", "111th try", "112th try"],
  );
});

const LU = "2026-11-19T12:04:30.000Z";
const IL_Y_A = (secondes: number) => new Date(Date.parse(LU) - secondes * 1000).toISOString();
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
const card = (ticket: number, state: string, activity: object) => ({ ticket, etat: state, titre: `Ticket ${ticket}`, url: `https://github.com/chef/parade/issues/${ticket}`, activite: activity });

// Le projet ouvert, et une lecture de `facts` reçue : la voie par laquelle la cuisine suit le tableau.
async function ouvrir(rail: unknown[]): Promise<Jouee> {
  const vue = await jouerLaVue({ demarrage, espace: () => [], machines: () => [{ id: "poste", titre: "this computer" }] } as never);
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  const demandes = vue.appels.filter(({ geste: action }) => action === "faits" || action === "relireBox");
  const facts = { etat: "ouverte", lu: LU, dernierTick: LU, compteurs: { rail: rail.length, auTravail: 1, aLaPass: 1, attend: 0, livres24h: 0 }, dernierEvenement: null, rail, cooks: [], attend: [] };
  const recue = holdFacts(() => new Map()).recevoir({ projet: "parade", demande: 0, a: LU, sorties: [{ commande: "facts", texte: JSON.stringify(facts) }] });
  vue.dire("surFaits", { ...recue, demande: demandes.at(-1)?.args[0] as number });
  await repos();
  return vue;
}
const texte = (vue: Jouee, numero: number): string => (cardDuTicket(vue, numero) ?? assert.fail(`pas de bon #${numero}`)).textContent;

test("a pass card shows the step facts gives, and a thinking cook says so on its card", async () => {
  const vue = await ouvrir([
    card(21, "en pass", { fait: "jugement en cours", faitEn: "judging", cible: "ci.yml", depuis: IL_Y_A(45), etape: "CI running" }),
    card(14, "pris", { fait: "réfléchit", faitEn: "thinking", cible: null, depuis: IL_Y_A(4) }),
  ]);
  assert.ok(texte(vue, 21).includes("CI running · 45 s ago"), texte(vue, 21));
  assert.ok(!texte(vue, 21).includes("judging"), texte(vue, 21));
  assert.ok(texte(vue, 14).includes("thinking · 4 s ago"), texte(vue, 14));
});
