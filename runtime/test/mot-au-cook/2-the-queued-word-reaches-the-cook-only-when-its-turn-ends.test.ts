// #4047, critère 2 : le mot en file n'arrive au cook qu'à la fin de son tour en cours.
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

test("the queued word is delivered only when the current turn ends, never in the middle of it", async () => {
  const { mot, livres } = cuisine({ 7: "taken" });
  mot.debutDeTour(7);
  await mot.envoyer({ ticket: 7, text: "use the small table" });
  assert.equal(livres.length, 0, "nothing is delivered in the middle of a turn");
  await mot.finDeTour(7);
  assert.deepEqual(livres, [{ ticket: 7, texte: "use the small table" }]);
});
