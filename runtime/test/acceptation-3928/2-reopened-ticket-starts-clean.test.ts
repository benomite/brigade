// #3928, critère 2 : un ticket rouvert repart d'un état propre — ni `tests-written` périmé, ni compte d'échecs
// périmé. Le geste de rouvrir de la station (la réparation de la base rouge, #3614) sur un ticket qui portait
// `tests-written`, `set-aside:failures` et des échecs de cook.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ECHECS_ATTEINTS } from "../../src/github.ts";
import { ouvreReparation, type CheckDeLaBase, type GitHubDeLaReparation } from "../../src/base-rouge/ouvre-reparation.ts";
import { MARQUE_D_ECHEC } from "../../src/qualite-github.ts";
import { LABEL_TESTS_ECRITS } from "../../src/tests-acceptation/etape.ts";

const ROUGE: CheckDeLaBase[] = [{ name: "windows tests (1/4)", outcome: "red" }];

test("a reopened ticket carries no stale 'tests-written' and no stale failure count", async () => {
  let ordre = 0;
  const evenements: Array<{ quoi: string; ordre: number }> = [];
  let tete = "a".repeat(40);
  const issue = { number: 3860, titre: "", corps: "", labels: [] as string[], state: "open" as "open" | "closed" };
  const commentaires = [1, 2, 3].map((n) => ({ id: n, body: `${MARQUE_D_ECHEC} n=${n} -->\nthe cook stopped without a delivery`, ordre: ++ordre }));
  const github: GitHubDeLaReparation & { delabelliser(numero: number, label: string): Promise<void>; supprimerCommentaire(numero: number, id: number): Promise<void> } = {
    teteDeLaBase: async () => tete,
    issuesDepuis: async () => [{ number: issue.number, title: issue.titre, body: issue.corps, association: "OWNER", state: issue.state, labels: issue.labels, updatedAt: "2026-11-20T13:54:00Z" }],
    creerIssue: async ({ titre, corps, labels }) => {
      Object.assign(issue, { titre, corps, labels: [...labels] });
      return issue.number;
    },
    fermerIssue: async () => undefined,
    rouvrirIssue: async () => {
      issue.state = "open";
    },
    ecrireCorps: async (_, corps) => {
      issue.corps = corps;
    },
    ecrireTitre: async () => undefined,
    delabelliser: async (_, label) => {
      issue.labels = issue.labels.filter((l) => l !== label);
      evenements.push({ quoi: `retrait ${label}`, ordre: ++ordre });
    },
    supprimerCommentaire: async (_, id) => {
      const place = commentaires.findIndex((c) => c.id === id);
      if (place >= 0) commentaires.splice(place, 1);
    },
  };
  const ouvrir = ouvreReparation({ github, base: "main", maintenant: () => new Date("2026-11-20T14:00:00Z") });
  // Le ticket de réparation de la base, ouvert, cuit, livré, puis fermé avec ses étiquettes d'étape.
  await ouvrir(ROUGE);
  issue.labels.push(LABEL_TESTS_ECRITS, ECHECS_ATTEINTS);
  issue.state = "closed";
  evenements.length = 0;
  tete = "c".repeat(40);
  const ouverte = await ouvrir(ROUGE);
  assert.ok("reparation" in ouverte || "numero" in ouverte);
  assert.equal(issue.state, "open", "the ticket is reopened");
  assert.ok(!issue.labels.includes(LABEL_TESTS_ECRITS), "no stale 'tests-written'");
  assert.ok(!issue.labels.includes(ECHECS_ATTEINTS), "no stale set-aside by failures");
  const derniere = Math.max(0, ...commentaires.map((c) => c.ordre));
  const remise = evenements.some((e) => e.quoi.startsWith("retrait") && e.ordre > derniere);
  assert.ok(commentaires.length === 0 || remise, "the failures before the reopening no longer count");
});
