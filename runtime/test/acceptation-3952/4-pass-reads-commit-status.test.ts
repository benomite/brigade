// #3952, critère 4 : la pass lit le statut du commit, pas la conclusion du run : un statut en échec avec un run vert
// renvoie la livraison ; un statut success la laisse passer.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { corpsDeVerdict, fusionner, type GitHubDeLaFusion } from "../../src/github-etat/fusion.ts";

const WORKFLOW = readFileSync(new URL("../../../.github/workflows/tests.yml", import.meta.url), "utf8").replace(/^\s*#.*$/gm, "");
const SHA = "a".repeat(40);
const PR = { number: 7, sha: SHA, state: "open" as const, merged: false, enRetard: false, enConflit: false };

function github(statut: "success" | "failure") {
  const merges: number[] = [];
  const client: GitHubDeLaFusion = {
    commentaires: async () => [{ id: 1, body: corpsDeVerdict("A", SHA, { verdict: "approve", motif: "" }), association: "OWNER", createdAt: "2026-01-01T00:00:00Z" }],
    commenter: async () => {},
    mettreAJour: async () => {},
    merger: async (numero) => (merges.push(numero), { fait: true }),
    // The run is green ; the real outcome is the commit status.
    ci: async () => [
      { name: "run", outcome: "green" },
      { name: "tests runtime (1/16)", outcome: statut === "success" ? "green" : "red" },
    ],
  };
  return { client, merges };
}

test("the workflow posts the statuses the pass reads", () => {
  assert.match(WORKFLOW, /statuses: write/);
});

// brigade:guard
test("a failing status with a green run sends the delivery back; a success status lets it through", async () => {
  const rouge = github("failure");
  assert.deepEqual(await fusionner(PR, rouge.client), { issue: "ci-rouge" });
  assert.deepEqual(rouge.merges, []);
  const vert = github("success");
  assert.deepEqual(await fusionner(PR, vert.client), { issue: "mergee" });
  assert.deepEqual(vert.merges, [7]);
});
