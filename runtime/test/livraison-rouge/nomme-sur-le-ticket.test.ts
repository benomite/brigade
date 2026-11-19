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

test("when main turns red after a merge, the ticket of the merged PR gets one comment with the PR number and the failing check's name", async () => {
  const depot = new FauxDepot();
  await nommeLaLivraison({ github: depot.github(), base: "main" })(ROUGE);
  assert.deepEqual([...depot.commentaires.keys()], [57]);
  const commentaires = depot.commentaires.get(57) ?? [];
  assert.equal(commentaires.length, 1);
  assert.match(commentaires[0] as string, /#42\b/);
  assert.ok((commentaires[0] as string).includes("tests"));
});
