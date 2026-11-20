// #3914, critère 5 : sur une main rouge, le superviseur relance d'abord les jobs en échec, ne dépose un ticket de
// réparation que si la relance reste rouge, et au plus un par check rouge.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Geste } from "../../src/superviseur/gestes.ts";
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

const CORRECTIF: Geste = { geste: "ouvrir-un-correctif", titre: "Repair main: unit", corps: "cause", cause: { genre: "ci", check: "unit" } };
const DECLENCHEMENT = { cause: "base-rouge", check: "unit" } as const;

test("on a red main the failed jobs are rerun before any repair ticket", async () => {
  const github = fauxGitHub({ apresRelance: "rouge" });
  await tourDuSuperviseur({ github, declenchement: DECLENCHEMENT, vu: "main red on unit", actions: [CORRECTIF] });
  const noms = github.appels.map((appel) => appel.nom);
  assert.ok(noms.indexOf("relancerLesJobs") >= 0 && noms.indexOf("relancerLesJobs") < noms.indexOf("ouvrirCorrectif"));
  assert.equal(github.correctifs.length, 1);
});

test("no repair ticket is filed when the rerun turns green", async () => {
  const github = fauxGitHub({ apresRelance: "vert" });
  await tourDuSuperviseur({ github, declenchement: DECLENCHEMENT, vu: "main red on unit", actions: [CORRECTIF] });
  assert.ok(github.appels.some((appel) => appel.nom === "relancerLesJobs"));
  assert.equal(github.correctifs.length, 0);
});

test("at most one repair ticket per red check, across proposals and across runs", async () => {
  const github = fauxGitHub({ apresRelance: "rouge" });
  await tourDuSuperviseur({ github, declenchement: DECLENCHEMENT, vu: "main red on unit", actions: [CORRECTIF, CORRECTIF] });
  assert.equal(github.correctifs.length, 1, "two proposals for the same check file one ticket");
  const suivant = fauxGitHub({ apresRelance: "rouge", ouverts: [{ numero: 100, cause: "ci:unit" }] });
  await tourDuSuperviseur({ github: suivant, declenchement: DECLENCHEMENT, vu: "main red on unit", actions: [CORRECTIF] });
  assert.equal(suivant.correctifs.length, 0, "an open ticket already has this cause");
});
