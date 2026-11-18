// Une livraison qui casse plusieurs checks, ou qui livre plusieurs tickets
// (#3817) : chaque check est nommé sous un titre au pluriel, chaque ticket a
// son commentaire, un seul.
import assert from "node:assert/strict";
import { test } from "node:test";
import { nommeLaLivraison, type GitHubDeLaLivraison } from "../../src/livraison-rouge/nomme-livraison.ts";

const MERGE = "c".repeat(40);
const TESTS = { name: "tests", outcome: "red" as const, url: "https://github.com/o/r/actions/runs/11/job/1" };
const LINT = { name: "lint", outcome: "red" as const, url: "https://github.com/o/r/actions/runs/11/job/2" };

function depot(tickets: number[]) {
  const commentaires = new Map<number, string[]>();
  const github: GitHubDeLaLivraison = {
    commitDuPremierRouge: async (rouges) => ({ sha: MERGE, rouges }),
    prDuCommit: async () => 42,
    ticketsLiesALaPR: async () => tickets,
    commentairesDe: async (numero) => commentaires.get(numero) ?? [],
    commenter: async (numero, corps) => void commentaires.set(numero, [...(commentaires.get(numero) ?? []), corps]),
  };
  return { github, commentaires };
}

test("one failing check is named under a singular heading, several under a plural one", async () => {
  const seul = depot([57]);
  await nommeLaLivraison({ github: seul.github, base: "main" })([TESTS]);
  const [unCheck] = seul.commentaires.get(57) ?? [];
  assert.match(unCheck ?? "", /^Failing check:$/m);
  assert.doesNotMatch(unCheck ?? "", /Failing checks:/);
  const deux = depot([57]);
  await nommeLaLivraison({ github: deux.github, base: "main" })([TESTS, LINT]);
  const [deuxChecks] = deux.commentaires.get(57) ?? [];
  assert.match(deuxChecks ?? "", /^Failing checks:$/m);
  assert.ok(deuxChecks?.includes(`- \`tests\`: ${TESTS.url}`) && deuxChecks.includes(`- \`lint\`: ${LINT.url}`));
});

test("a delivery that serves two tickets is named once on each, and never on its PR", async () => {
  const { github, commentaires } = depot([57, 61]);
  const nommer = nommeLaLivraison({ github, base: "main" });
  await nommer([TESTS]);
  await nommeLaLivraison({ github, base: "main" })([TESTS]);
  assert.deepEqual([...commentaires.keys()].sort(), [57, 61]);
  assert.equal(commentaires.get(57)?.length, 1);
  assert.equal(commentaires.get(61)?.length, 1);
});
