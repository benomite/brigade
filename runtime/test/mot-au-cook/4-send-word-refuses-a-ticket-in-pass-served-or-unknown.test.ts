// #4047, critère 4 : `send-word` refuse un ticket en pass, servi ou inconnu, sans rien poster ni mettre en file.
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

test("send-word on a ticket in pass, served or unknown refuses with a one-line reason and does nothing", async () => {
  const { mot, commentaires, livres } = cuisine({ 1: "in pass", 2: "served" });
  for (const ticket of [1, 2, 3]) {
    const reponse = await mot.envoyer({ ticket, text: "hello" });
    assert.equal(reponse.ok, false);
    assert.equal(typeof reponse.reason, "string");
    const raison: string = reponse.reason.trim();
    assert.ok(raison.length > 0 && !raison.includes("\n"), `one line: ${reponse.reason}`);
  }
  for (const ticket of [1, 2, 3]) {
    mot.debutDeTour(ticket);
    await mot.finDeTour(ticket);
  }
  assert.equal(commentaires.length, 0, "no comment is posted");
  assert.equal(livres.length, 0, "nothing is delivered");
  assert.equal(mot.entreeDuTour(1, "base"), "base", "nothing is queued");
});
