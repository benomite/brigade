// #3914, critère 4 : le superviseur n'offre que six gestes ; toute autre action est refusée.
import assert from "node:assert/strict";
import { test } from "node:test";
import { GESTES, executer, type Geste } from "../../src/superviseur/gestes.ts";
import type { GitHubDuSuperviseur } from "../../src/superviseur/gestes.ts";

// Un GitHub faux qui note ses appels. `apresRelance` : la CI de main après la relance ; `ouverts` : les tickets ouverts.
type FauxGitHub = GitHubDuSuperviseur & { appels: { nom: string; args: unknown[] }[]; correctifs: number[] };

// `apresRelance` : le résultat de la CI de main après la relance. `ouverts` : les tickets ouverts, pour chercher un doublon.
function fauxGitHub(options: { apresRelance?: "vert" | "rouge"; ouverts?: { numero: number; cause: string }[] } = {}): FauxGitHub {
  const appels: FauxGitHub["appels"] = [];
  const correctifs: number[] = [];
  const noter = (nom: string, ...args: unknown[]) => void appels.push({ nom, args });
  return {
    appels,
    correctifs,
    relancerLesJobs: async () => (noter("relancerLesJobs"), options.apresRelance ?? "rouge"),
    remettreSurLeRail: async (ticket, note) => void noter("remettreSurLeRail", ticket, note),
    mettreEnAttente: async (ticket, tiers) => void noter("mettreEnAttente", ticket, tiers),
    fermer: async (ticket, doublonDe) => void noter("fermer", ticket, doublonDe),
    ticketsOuverts: async () => options.ouverts ?? [],
    ouvrirCorrectif: async (correctif) => {
      noter("ouvrirCorrectif", correctif);
      correctifs.push(100 + correctifs.length);
      return 100 + correctifs.length - 1;
    },
    poserCarte: async (carte) => void noter("poserCarte", carte),
    commenter: async (ticket, texte) => void noter("commenter", ticket, texte),
  };
}

test("the supervisor offers exactly six gestures", () => {
  assert.deepEqual([...GESTES].sort(), ["fermer-un-doublon", "mettre-en-attente", "ouvrir-un-correctif", "poser-une-carte-todo", "relancer-les-jobs", "remettre-sur-le-rail"]);
});

test("each of the six gestures does its one thing", async () => {
  const github = fauxGitHub();
  const actions: Geste[] = [
    { geste: "relancer-les-jobs" },
    { geste: "remettre-sur-le-rail", ticket: 1, note: "retry with the fixed fixture" },
    { geste: "mettre-en-attente", ticket: 2, tiers: "the Stripe support" },
    { geste: "fermer-un-doublon", ticket: 3, doublonDe: 4 },
    { geste: "ouvrir-un-correctif", titre: "Fix the flaky clock", corps: "cause", cause: { genre: "ci", check: "unit" } },
    { geste: "poser-une-carte-todo", nature: "produit", question: "Which price do we show?" },
  ];
  for (const action of actions) assert.deepEqual(await executer(github, action), { fait: true }, action.geste);
  assert.deepEqual(github.appels.map((appel) => appel.nom), ["relancerLesJobs", "remettreSurLeRail", "mettreEnAttente", "fermer", "ouvrirCorrectif", "poserCarte"]);
  assert.deepEqual(github.appels[2], { nom: "mettreEnAttente", args: [2, "the Stripe support"] });
});

test("any other action is refused and touches nothing", async () => {
  const github = fauxGitHub();
  for (const action of [{ geste: "merger-la-pr", pr: 9 }, { geste: "rebaser", pr: 9 }, { geste: "supprimer-une-branche" }, { geste: "mettre-en-attente", ticket: 2 }, {}]) {
    const reponse = await executer(github, action as never);
    assert.equal("fait" in reponse && reponse.fait, false, JSON.stringify(action));
    assert.ok("refus" in reponse && reponse.refus.length > 0);
  }
  assert.deepEqual(github.appels, []);
});
