// Le tour d'une station GitHub lance l'alerte du temps de cuisson (#2676) :
// les rapports et le seuil se lisent dans le clone du projet, et un seul
// ticket de correction s'ouvre.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { MARQUE_CORRECTION } from "../../src/alerte-temps-cuisson/alerte.ts";
import { stationGitHub, type GitHubDuTour, type TicketLu } from "../../src/brigade-github.ts";
import { repertoireTemporaire } from "../outils.ts";

type Issue = { number: number; title: string; body: string; labels: string[]; state: "open" | "closed" };

// Le GitHub d'un projet à la base verte, réduit à ce que le tour lit et écrit ;
// la station ne prend rien (`prise` refuse), elle ne fait que tourner.
function faux() {
  const issues: Issue[] = [];
  const github = {
    checksDeLaBase: async () => [{ name: "tests", outcome: "green" as const }],
    fires: async (): Promise<TicketLu[]> => issues.filter((i) => i.state === "open" && i.labels.includes("fire")).map(({ number, title, labels, state }) => ({ number, title, labels, state })),
    issuesDepuis: async () => issues.map(({ number, body, state }) => ({ number, body, state, association: "OWNER" })),
    creerIssue: async ({ titre, corps, labels }: { titre: string; corps: string; labels: string[] }) => {
      const number = 3000 + issues.length;
      issues.push({ number, title: titre, body: corps, labels, state: "open" });
      return number;
    },
    fermerIssue: async (numero: number) => {
      const issue = issues.find((i) => i.number === numero);
      if (issue) issue.state = "closed";
    },
    corpsDuTicket: async (numero: number) => issues.find((i) => i.number === numero)?.body ?? "",
    prDuTicket: async () => null,
    commentaires: async () => [],
    dependancesOuvertes: async () => [],
    prsOuvertes: async () => [],
    retraitsDeLabels: async () => [],
  };
  return { issues, github: github as unknown as GitHubDuTour };
}

// Un clone dont les tickets servis ont cuit `[attendu, réel]` minutes, au format
// que #2675 écrit dans ratios-cuisson.json.
function clone(tc: TestContext, cuissons: [number, number][], projet: string = "{}"): string {
  const depot = repertoireTemporaire(tc);
  const dossier = join(depot, ".claude", "brigade");
  mkdirSync(dossier, { recursive: true });
  writeFileSync(join(dossier, "projet.json"), projet);
  const ratios = cuissons.map(([attendu, reel], rang) => ({ ticket: 2600 + rang, servedAt: new Date(Date.UTC(2026, 10, 7, rang)).toISOString(), attendu, reel, ratio: reel / attendu }));
  writeFileSync(join(dossier, "ratios-cuisson.json"), JSON.stringify(ratios));
  return depot;
}

const station = (github: GitHubDuTour, depot: string, avertis: string[]) =>
  stationGitHub({
    nom: "box/test",
    places: 1,
    base: "main",
    github,
    prise: { prendre: async () => ({ prise: false }), lacher: async () => true },
    cuisiner: async () => ({ echec: "not here" }),
    juger: async () => ({ verdict: "approve", motif: "" }),
    clone: depot,
    avertir: (texte) => avertis.push(texte),
  });

test("over cookingOverEstimateMax, the station's turn opens one cooking-time correction ticket, and no second one while it is open", async (tc) => {
  const { issues, github } = faux();
  const avertis: string[] = [];
  const s = station(github, clone(tc, [[10, 30], [10, 20], [5, 20]]), avertis);
  await s.tour();
  await s.tour();
  await station(github, clone(tc, [[10, 30], [10, 20], [5, 20]]), avertis).tour();
  assert.deepEqual(avertis, []);
  const ouvertes = issues.filter((i) => i.body.startsWith(MARQUE_CORRECTION));
  assert.equal(ouvertes.length, 1);
  assert.match(ouvertes[0]?.body ?? "", /\| #2602 \| 5 min \| 20 min \| ×4\.00 \|\n\| #2600 \| 10 min \| 30 min \| ×3\.00 \|/);
});

test("the project's own cookingOverEstimateMax holds in the turn: under it, nothing opens", async (tc) => {
  const { issues, github } = faux();
  const avertis: string[] = [];
  await station(github, clone(tc, [[10, 30], [10, 20], [5, 20]], JSON.stringify({ cookingOverEstimateMax: 4 })), avertis).tour();
  assert.deepEqual(avertis, []);
  assert.equal(issues.filter((i) => i.body.startsWith(MARQUE_CORRECTION)).length, 0);
});

test("a malformed projet.json is said once, not at every turn, and the default threshold still holds", async (tc) => {
  const { issues, github } = faux();
  const avertis: string[] = [];
  const s = station(github, clone(tc, [[10, 30], [10, 20], [5, 20]], "{ not json"), avertis);
  await s.tour();
  await s.tour();
  assert.equal(avertis.filter((texte) => texte.includes("cookingOverEstimateMax falls back to 1.5")).length, 1);
  assert.equal(issues.filter((i) => i.body.startsWith(MARQUE_CORRECTION)).length, 1);
});
