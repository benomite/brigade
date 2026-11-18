// Le client du nommage sur le client GitHub du runtime (#3817) : le premier
// commit rouge en remontant la base, la PR dont il est le merge, les tickets
// qu'elle livre.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { GitHub } from "../../src/github.ts";
import { githubDeLaLivraison } from "../../src/livraison-rouge/github-de-la-livraison.ts";

const TETE = "d".repeat(40);
const MERGE = "c".repeat(40);
const VERT = "a".repeat(40);
const URL_TETE = "https://github.com/o/r/actions/runs/12/job/2";
const URL_MERGE = "https://github.com/o/r/actions/runs/11/job/1";

// Un dépôt dont la base va VERT → MERGE (PR #42, rouge) → TETE (rouge).
function client(graphql = true): GitHub & { requetes: Record<string, string | number>[] } {
  const requetes: Record<string, string | number>[] = [];
  const parents: Record<string, string> = { [TETE]: MERGE, [MERGE]: VERT };
  const ci: Record<string, { name: string; outcome: "red" | "green"; conclusion: string; url: string }[]> = {
    [MERGE]: [{ name: "tests", outcome: "red", conclusion: "failure", url: URL_MERGE }, { name: "lint", outcome: "green", conclusion: "success", url: "" }],
    [VERT]: [{ name: "tests", outcome: "green", conclusion: "success", url: "" }],
  };
  const lu: Partial<GitHub> = {
    teteDeLaBase: async (branche) => (branche === "main" ? TETE : assert.fail(branche)),
    commitGit: async (sha) => (parents[sha] === undefined ? null : { arbre: "t", parents: [parents[sha] as string] }),
    ci: async (sha) => (ci[sha] ?? []) as never,
    commentaires: async () => [
      { body: "de confiance", author: "brigade", association: "OWNER", createdAt: "" },
      { body: "d'un inconnu", author: "x", association: "NONE", createdAt: "" },
    ],
    commenter: async () => {},
    ...(graphql
      ? {
          lireGraphql: async (requete: string, variables: Record<string, string | number>) => {
            requetes.push(variables);
            if (requete.includes("associatedPullRequests")) {
              // #50 contient le commit (sa branche a fusionné la base), #42 l'a posé.
              return { repository: { object: { associatedPullRequests: { nodes: [{ number: 50, merged: false, mergeCommit: null }, { number: 42, merged: true, mergeCommit: { oid: variables.sha === MERGE ? MERGE : "e".repeat(40) } }] } } } };
            }
            if (variables.pr === 42) return { repository: { pullRequest: { headRefName: "cook/57-github", body: "Closes #57\n\nAlso fixes #60.", closingIssuesReferences: { nodes: [{ number: 57 }, { number: 61 }] } } } };
            return { repository: { pullRequest: null } };
          },
        }
      : {}),
  };
  return Object.assign(lu as GitHub, { requetes });
}

test("the first red commit is found by walking the base back while the same check stays red, with that commit's own check run", async () => {
  const github = githubDeLaLivraison(client(), "main", "o/r");
  assert.ok(github !== null);
  assert.deepEqual(await github.commitDuPremierRouge([{ name: "tests", outcome: "red", url: URL_TETE }]), { sha: MERGE, rouges: [{ name: "tests", outcome: "red", conclusion: "failure", url: URL_MERGE }] });
  // Un check que le parent n'a pas rouge : la tête est le premier rouge.
  assert.deepEqual(await github.commitDuPremierRouge([{ name: "lint", outcome: "red", url: URL_TETE }]), { sha: TETE, rouges: [{ name: "lint", outcome: "red", url: URL_TETE }] });
});

test("the delivery is the PR whose merge commit is the red commit, not a PR that only contains it; its tickets are its cook branch's and those it closes", async () => {
  const lu = client();
  const github = githubDeLaLivraison(lu, "main", "o/r");
  assert.ok(github !== null);
  assert.equal(await github.prDuCommit(MERGE), 42);
  assert.equal(await github.prDuCommit(TETE), null);
  assert.deepEqual(await github.ticketsLiesALaPR(42), [57, 61]);
  await assert.rejects(github.ticketsLiesALaPR(43), /PR #43 is unreadable/);
  assert.ok(lu.requetes.every((variables) => variables.owner === "o" && variables.repo === "r"));
  assert.deepEqual(await github.commentairesDe(57), ["de confiance"]);
});

test("a client that cannot read GraphQL, or no repository named, names nothing", () => {
  assert.equal(githubDeLaLivraison(client(false), "main", "o/r"), null);
  assert.equal(githubDeLaLivraison(client(), "main", undefined), null);
});
