import assert from "node:assert/strict";
import { test } from "node:test";
import { creerCarteBacklogVide, type IssueDuBacklog } from "../../src/carte-backlog-vide/carte-backlog-vide.ts";

const issue = (number: number, labels: string[] = []): IssueDuBacklog => ({ number, labels });

test("when an issue becomes cookable and the backlog later becomes empty again, a new card is sent", () => {
  const cartes: string[] = [];
  const carte = creerCarteBacklogVide({ envoyer: (texte: string) => void cartes.push(texte) });
  carte.boucle([]);
  carte.boucle([]);
  assert.equal(cartes.length, 1);
  carte.boucle([issue(7, ["fire"]), issue(1, ["idea"])]);
  assert.equal(cartes.length, 1);
  carte.boucle([issue(1, ["idea"])]);
  assert.equal(cartes.length, 2);
  carte.boucle([issue(1, ["idea"])]);
  assert.equal(cartes.length, 2);
});
