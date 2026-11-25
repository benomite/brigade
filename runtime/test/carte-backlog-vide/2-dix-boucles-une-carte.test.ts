import assert from "node:assert/strict";
import { test } from "node:test";
import { creerCarteBacklogVide, type IssueDuBacklog } from "../../src/carte-backlog-vide/carte-backlog-vide.ts";

const issue = (number: number, labels: string[] = []): IssueDuBacklog => ({ number, labels });

test("ten manager loops in the same empty state produce one card, not ten", () => {
  const cartes: string[] = [];
  const carte = creerCarteBacklogVide({ envoyer: (texte: string) => void cartes.push(texte) });
  for (let i = 0; i < 10; i++) carte.boucle([issue(1, ["idea"]), issue(2, ["parked"])]);
  assert.equal(cartes.length, 1);
});
