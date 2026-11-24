// #4047, critère 5 : le mot reste lisible sur l'issue après sa livraison.
import assert from "node:assert/strict";
import { test } from "node:test";
import { creerMotAuCook } from "../../src/mot-au-cook/mot-au-cook.ts";

type Etat = "taken" | "in pass" | "served" | undefined;
function cuisine(etats: Record<number, Etat>) {
  const commentaires: { ticket: number; texte: string }[] = [];
  const livres: { ticket: number; texte: string }[] = [];
  const mot = creerMotAuCook({
    etat: (ticket: number) => etats[ticket],
    commenter: async (ticket: number, texte: string) => {
      commentaires.push({ ticket, texte });
    },
    livrer: async (ticket: number, texte: string) => {
      livres.push({ ticket, texte });
    },
  } as never) as any;
  return { mot, commentaires, livres };
}

test("the word stays readable on the issue after delivery", async () => {
  const { mot, commentaires, livres } = cuisine({ 7: "taken" });
  mot.debutDeTour(7);
  await mot.envoyer({ ticket: 7, text: "use the small table" });
  await mot.finDeTour(7);
  mot.debutDeTour(7);
  await mot.finDeTour(7);
  assert.equal(livres.length, 1, "the word was delivered");
  const surLIssue = commentaires.filter((c) => c.ticket === 7 && /use the small table/.test(c.texte));
  assert.equal(surLIssue.length, 1, "the comment is still there, posted once");
});
