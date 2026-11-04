// L'état d'un tour en une requête GraphQL (#2301) : ce que l'instantané lit de
// la réponse, et un tour servi par lui sans lecture REST de ses tickets, de
// leurs PR, de leur CI ni des fichiers des PR.
import assert from "node:assert/strict";
import { test } from "node:test";
import { clientDuTour } from "../../src/brigade-github.ts";
import { lireInstantane } from "../../src/github-etat/instantane.ts";
import type { GitHub } from "../../src/github.ts";

const SHA = "c".repeat(40);

const reponse = {
  repository: {
    issues: { pageInfo: { hasNextPage: false }, nodes: [{ number: 12, title: "Twelve", labels: { nodes: [{ name: "fire" }, { name: "in-pass" }] } }] },
    pullRequests: {
      nodes: [
        {
          number: 90,
          headRefName: "cook/12-github",
          headRefOid: SHA,
          mergeable: "CONFLICTING",
          mergeStateStatus: "DIRTY",
          files: { nodes: [{ path: "runtime/src/a.ts" }] },
          commits: { nodes: [{ commit: { statusCheckRollup: { contexts: { nodes: [
            { __typename: "CheckRun", name: "tests", status: "COMPLETED", conclusion: "SUCCESS" },
            { __typename: "CheckRun", name: "gates", status: "IN_PROGRESS", conclusion: null },
            { __typename: "StatusContext", context: "deploy", state: "FAILURE" },
          ] } } } }] },
        },
        { number: 91, headRefName: "second/x", headRefOid: "d".repeat(40), mergeable: "MERGEABLE", mergeStateStatus: "BEHIND", files: { nodes: [{ path: "docs/b.md" }] }, commits: { nodes: [] } },
      ],
    },
    ref: { target: { statusCheckRollup: { contexts: { nodes: [{ __typename: "CheckRun", name: "tests", status: "COMPLETED", conclusion: "FAILURE" }] } } } },
  },
};

test("the snapshot reads tickets, open PRs with their CI, files and mergeability, and the base's CI", () => {
  const lu = lireInstantane(reponse);
  assert.deepEqual(lu.tickets, [{ number: 12, title: "Twelve", labels: ["fire", "in-pass"], state: "open" }]);
  assert.equal(lu.incomplet, false);
  assert.deepEqual(lu.prs.map((p) => [p.number, p.enConflit, p.enRetard, p.fichiers]), [
    [90, true, false, ["runtime/src/a.ts"]],
    [91, false, true, ["docs/b.md"]],
  ]);
  assert.deepEqual(lu.prs[0]?.ci, [
    { name: "tests", outcome: "green" },
    { name: "gates", outcome: "pending" },
    { name: "deploy", outcome: "red" },
  ]);
  assert.deepEqual(lu.base, [{ name: "tests", outcome: "red" }]);
});

test("a turn served by the snapshot reads its tickets, PRs, CI and files with one GraphQL call and no REST read", async () => {
  const rest: string[] = [];
  const graphql: Array<Record<string, string | number>> = [];
  const refuser = (quoi: string) => async () => {
    rest.push(quoi);
    throw new Error(`REST ${quoi} should not be read`);
  };
  const github = {
    lireGraphql: async (_requete: string, variables: Record<string, string | number>) => (graphql.push(variables), reponse),
    tickets: refuser("tickets"),
    prDeBranche: refuser("prDeBranche"),
    ci: refuser("ci"),
    prsOuvertes: refuser("prsOuvertes"),
    mettreAJour: async () => {},
    retraitsDeLabels: async () => [],
  } as unknown as GitHub;
  const tour = clientDuTour(github, "main", "acme/brigade");
  assert.deepEqual(await tour.checksDeLaBase(), [{ name: "tests", outcome: "red" }]);
  assert.deepEqual((await tour.fires()).map((t) => t.number), [12]);
  const pr = await tour.prDuTicket(12);
  assert.deepEqual([pr?.number, pr?.sha, pr?.enConflit], [90, SHA, true]);
  assert.equal((await tour.ci(SHA)).length, 3);
  assert.deepEqual((await tour.prsOuvertes()).map((p) => p.branche), ["cook/12-github", "second/x"]);
  assert.deepEqual(graphql, [{ owner: "acme", repo: "brigade", base: "refs/heads/main" }]);
  assert.deepEqual(rest, []);
});

const avecPR = (pr: Record<string, unknown>, pages: Record<string, unknown> = {}) => ({
  repository: { ...reponse.repository, pullRequests: { pageInfo: { hasNextPage: false }, nodes: [{ ...reponse.repository.pullRequests.nodes[0], ...pr }] }, ...pages },
});

test("the snapshot says what the query truncated or lost: PRs, files, renames, CI contexts", () => {
  assert.equal(lireInstantane(reponse).prsTronquees, false);
  assert.equal(lireInstantane(reponse).prs[0]?.fichiersIncomplets, false);
  const tronquees = { ...reponse, repository: { ...reponse.repository, pullRequests: { ...reponse.repository.pullRequests, pageInfo: { hasNextPage: true } } } };
  assert.equal(lireInstantane(tronquees).prsTronquees, true);
  assert.equal(lireInstantane(avecPR({ files: { pageInfo: { hasNextPage: true }, nodes: [] } })).prs[0]?.fichiersIncomplets, true);
  assert.equal(lireInstantane(avecPR({ files: { nodes: [{ path: "a", changeType: "RENAMED" }] } })).prs[0]?.fichiersIncomplets, true);
  assert.equal(lireInstantane(avecPR({ commits: { nodes: [{ commit: { statusCheckRollup: { contexts: { pageInfo: { hasNextPage: true }, nodes: [] } } } }] } })).prs[0]?.ciIncomplete, true);
  const base = { ...reponse, repository: { ...reponse.repository, ref: { target: { statusCheckRollup: { contexts: { pageInfo: { hasNextPage: true }, nodes: [] } } } } } };
  assert.equal(lireInstantane(base).baseIncomplete, true);
});

test("a truncated snapshot falls back to REST for the PRs, their files and their CI", async () => {
  const rest: string[] = [];
  const tronquee = avecPR(
    { files: { nodes: [{ path: "b", changeType: "RENAMED" }] }, commits: { nodes: [{ commit: { statusCheckRollup: { contexts: { pageInfo: { hasNextPage: true }, nodes: [] } } } }] } },
    { ref: { target: { statusCheckRollup: { contexts: { pageInfo: { hasNextPage: true }, nodes: [] } } } } },
  );
  const github = {
    lireGraphql: async () => tronquee,
    ci: async (sha: string) => (rest.push(`ci ${sha.slice(0, 1)}`), [{ name: "rest", outcome: "green" }]),
    prsOuvertes: async () => (rest.push("prsOuvertes"), [{ number: 90, branche: "cook/12-github", fichiers: ["b", "a"] }]),
    mettreAJour: async () => {},
    retraitsDeLabels: async () => [],
  } as unknown as GitHub;
  const tour = clientDuTour(github, "main", "acme/brigade");
  assert.deepEqual(await tour.checksDeLaBase(), [{ name: "rest", outcome: "green" }]);
  assert.deepEqual(await tour.ci(SHA), [{ name: "rest", outcome: "green" }]);
  assert.deepEqual(await tour.prsOuvertes(), [{ branche: "cook/12-github", fichiers: ["b", "a"] }]);
  assert.deepEqual(rest, ["ci m", "ci c", "prsOuvertes"]);
});

test("a PR beyond the first page of the query is read in REST by its ticket", async () => {
  const lues: string[] = [];
  const github = {
    lireGraphql: async () => ({ repository: { ...reponse.repository, pullRequests: { pageInfo: { hasNextPage: true }, nodes: [] } } }),
    prDeBranche: async (branche: string) => (lues.push(branche), null),
    mettreAJour: async () => {},
    retraitsDeLabels: async () => [],
    prsOuvertes: async () => [],
  } as unknown as GitHub;
  const tour = clientDuTour(github, "main", "acme/brigade");
  await tour.checksDeLaBase();
  assert.equal(await tour.prDuTicket(12), null);
  assert.deepEqual(lues, ["cook/12-github"]);
});
