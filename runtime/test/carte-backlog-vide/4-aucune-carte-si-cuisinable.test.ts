import assert from "node:assert/strict";
import { test } from "node:test";
import { creerCarteBacklogVide, type IssueDuBacklog } from "../../src/carte-backlog-vide/carte-backlog-vide.ts";

const issue = (number: number, labels: string[] = []): IssueDuBacklog => ({ number, labels });

test("no card is sent while at least one issue is cookable", () => {
  const cartes: string[] = [];
  const carte = creerCarteBacklogVide({ envoyer: (texte: string) => void cartes.push(texte) });
  for (let i = 0; i < 5; i++) carte.boucle([issue(8, ["fire"]), issue(1, ["idea"]), issue(2, ["parked"])]);
  carte.boucle([issue(8, ["fire"])]);
  assert.deepEqual(cartes, []);
});
