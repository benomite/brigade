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
