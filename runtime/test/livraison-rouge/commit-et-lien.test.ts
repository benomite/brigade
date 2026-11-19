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

test("the comment gives the merge commit and the link to the failing check run", async () => {
  const depot = new FauxDepot();
  await nommeLaLivraison({ github: depot.github(), base: "main" })(ROUGE);
  const [commentaire] = depot.tous();
  assert.ok(commentaire);
  assert.ok(commentaire.includes(MERGE) || commentaire.includes(MERGE.slice(0, 7)));
  assert.ok(commentaire.includes(RUN));
});
