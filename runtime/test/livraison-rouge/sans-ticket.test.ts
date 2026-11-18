import assert from "node:assert/strict";
import { test } from "node:test";
import { nommeLaLivraison, type GitHubDeLaLivraison } from "../../src/livraison-rouge/nomme-livraison.ts";

const MERGE = "c".repeat(40);
const RUN = "https://github.com/o/r/actions/runs/11/job/1";

// Le GitHub du projet, réduit à ce que le module lit et écrit.
class FauxDepot {
  ticketsDeLaPR: number[] = [57];
  commentaires = new Map<number, string[]>();
  github(): GitHubDeLaLivraison {
    return {
      commitDuPremierRouge: async () => MERGE,
      prDuCommit: async (sha) => (sha === MERGE ? 42 : null),
      ticketsLiesALaPR: async () => this.ticketsDeLaPR,
      commentairesDe: async (numero) => this.commentaires.get(numero) ?? [],
      commenter: async (numero, corps) => {
        this.commentaires.set(numero, [...(this.commentaires.get(numero) ?? []), corps]);
      },
    };
  }
  tous(): string[] {
    return [...this.commentaires.values()].flat();
  }
}
const ROUGE = [{ name: "tests", outcome: "red" as const, url: RUN }];

test("if no ticket links to the delivery, the comment goes on the PR and no error stops the kitchen", async () => {
  const depot = new FauxDepot();
  depot.ticketsDeLaPR = [];
  await assert.doesNotReject(nommeLaLivraison({ github: depot.github(), base: "main" })(ROUGE));
  assert.deepEqual([...depot.commentaires.keys()], [42]);
  assert.equal(depot.commentaires.get(42)?.length, 1);
  // Même si GitHub refuse de lire les tickets liés, la cuisine continue.
  const casse = depot.github();
  casse.ticketsLiesALaPR = async () => {
    throw new Error("boom");
  };
  await assert.doesNotReject(nommeLaLivraison({ github: casse, base: "main" })(ROUGE));
});
