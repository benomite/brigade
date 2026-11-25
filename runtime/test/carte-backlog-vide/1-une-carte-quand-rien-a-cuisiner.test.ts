import assert from "node:assert/strict";
import { test } from "node:test";
import { creerCarteBacklogVide, type IssueDuBacklog } from "../../src/carte-backlog-vide/carte-backlog-vide.ts";

const issue = (number: number, labels: string[] = []): IssueDuBacklog => ({ number, labels });

for (const [nom, backlog] of [
  ["only idea issues", [issue(1, ["idea"]), issue(2, ["idea"])]],
  ["only parked issues", [issue(3, ["parked"]), issue(4, ["parked"])]],
  ["no open issue", []],
] as const) {
  test(`${nom}: the chef gets exactly one card saying nothing is left to cook`, () => {
    const cartes: string[] = [];
    const carte = creerCarteBacklogVide({ envoyer: (texte: string) => void cartes.push(texte) });
    carte.boucle([...backlog]);
    assert.equal(cartes.length, 1);
    assert.match(cartes[0] ?? "", /nothing (is )?left to cook/i);
  });
}
