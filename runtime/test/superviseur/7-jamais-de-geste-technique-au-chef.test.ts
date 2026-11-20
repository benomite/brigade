// #3914, critère 7 : on ne demande jamais au chef un rerun, un merge, un rebase ou une lecture de log — aucune carte TODO
// n'est posée pour cela.
import assert from "node:assert/strict";
import { test } from "node:test";
import { executer } from "../../src/superviseur/gestes.ts";
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

test("no TODO card is posted for a rerun, a merge, a rebase or a log reading", async () => {
  for (const nature of ["rerun", "merge", "rebase", "lecture-de-log"]) {
    const github = fauxGitHub();
    const reponse = await executer(github, { geste: "poser-une-carte-todo", nature, question: `Please do the ${nature} for me` } as never);
    assert.ok("refus" in reponse, nature);
    assert.equal(github.appels.filter((appel) => appel.nom === "poserCarte").length, 0, nature);
  }
});

test("a TODO card is posted for a product or a design question", async () => {
  for (const nature of ["produit", "design"] as const) {
    const github = fauxGitHub();
    assert.deepEqual(await executer(github, { geste: "poser-une-carte-todo", nature, question: "Which one do you prefer?" }), { fait: true });
    assert.equal(github.appels.filter((appel) => appel.nom === "poserCarte").length, 1, nature);
  }
});
