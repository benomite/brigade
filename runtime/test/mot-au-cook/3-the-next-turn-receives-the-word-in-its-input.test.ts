// #4047, critère 3 : le tour suivant du cook reçoit le mot dans son entrée.
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

test("the cook's next turn receives the word as part of its input", async () => {
  const { mot } = cuisine({ 7: "taken" });
  mot.debutDeTour(7);
  await mot.envoyer({ ticket: 7, text: "use the small table" });
  await mot.finDeTour(7);
  const entree: string = mot.entreeDuTour(7, "Continue the ticket.");
  assert.match(entree, /Continue the ticket\./);
  assert.match(entree, /use the small table/);
});
