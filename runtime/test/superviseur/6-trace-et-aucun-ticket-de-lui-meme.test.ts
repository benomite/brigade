// #3914, critère 6 : chaque tour écrit un commentaire sur le ticket sur lequel il a agi, avec ce qu'il a vu et ce qu'il
// a fait ; il ne dépose jamais de ticket de lui-même hors du geste « correctif », ni de ticket à propos d'un ticket.
import assert from "node:assert/strict";
import { test } from "node:test";
import { tourDuSuperviseur } from "../../src/superviseur/tour.ts";
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

const DECLENCHEMENT = { cause: "prises-sans-livraison", ticket: 12 } as const;

test("a run writes one comment on the ticket it acted on, with what it saw and what it did", async () => {
  const github = fauxGitHub();
  await tourDuSuperviseur({ github, declenchement: DECLENCHEMENT, vu: "taken 3 times, CI red on lint each time", actions: [{ geste: "remettre-sur-le-rail", ticket: 12, note: "lint fixed upstream" }] });
  const commentaires = github.appels.filter((appel) => appel.nom === "commenter");
  assert.equal(commentaires.length, 1);
  assert.equal(commentaires[0].args[0], 12);
  const texte = String(commentaires[0].args[1]);
  assert.match(texte, /taken 3 times, CI red on lint each time/);
  assert.match(texte, /put back on the rail/i);
});

test("a run that decides nothing files no ticket", async () => {
  const github = fauxGitHub();
  await tourDuSuperviseur({ github, declenchement: DECLENCHEMENT, vu: "nothing to do", actions: [] });
  assert.equal(github.appels.filter((appel) => appel.nom === "ouvrirCorrectif" || appel.nom === "poserCarte").length, 0);
  assert.equal(github.correctifs.length, 0);
});

test("a fix ticket about a ticket is refused", async () => {
  const github = fauxGitHub();
  await tourDuSuperviseur({
    github,
    declenchement: DECLENCHEMENT,
    vu: "taken 3 times",
    actions: [{ geste: "ouvrir-un-correctif", titre: "#12 loops", corps: "about #12", cause: { genre: "ticket", ticket: 12 } }],
  });
  assert.equal(github.correctifs.length, 0);
});

test("a fix ticket for a new cause is filed once, when no open ticket has that cause", async () => {
  const github = fauxGitHub();
  await tourDuSuperviseur({
    github,
    declenchement: DECLENCHEMENT,
    vu: "taken 3 times, same stack trace",
    actions: [{ geste: "ouvrir-un-correctif", titre: "Fix the parser crash", corps: "cause", cause: { genre: "code", identite: "parser-crash" } }],
  });
  assert.equal(github.correctifs.length, 1);
});
