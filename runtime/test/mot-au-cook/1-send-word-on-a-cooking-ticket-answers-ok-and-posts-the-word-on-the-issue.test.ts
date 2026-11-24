// #4047, critère 1 : `send-word` sur un ticket en cuisine répond ok et poste le mot sur l'issue.
import assert from "node:assert/strict";
import { test } from "node:test";
import { creerMotAuCook } from "../../src/mot-au-cook/mot-au-cook.ts";

// Contrat attendu de `creerMotAuCook({ etat, commenter, livrer })` : `envoyer` est la commande
// `send-word` ; `debutDeTour` / `finDeTour` marquent le tour du cook ; `entreeDuTour` donne
// l'entrée de son prochain tour.
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

test("send-word on a cooking ticket answers ok and posts the word as a comment", async () => {
  const { mot, commentaires } = cuisine({ 7: "taken" });
  const reponse = await mot.envoyer({ ticket: 7, text: "use the small table" });
  assert.deepEqual(reponse, { ok: true });
  assert.equal(commentaires.length, 1);
  assert.equal(commentaires[0].ticket, 7);
  assert.match(commentaires[0].texte, /use the small table/);
});
