// La règle de la carte du backlog vide, au-delà des critères (#4225) : chaque label parqué,
// un envoi qui échoue, la carte retirée quand une issue redevient cuisinable.
import assert from "node:assert/strict";
import { test } from "node:test";
import { creerCarteBacklogVide } from "../../src/carte-backlog-vide/carte-backlog-vide.ts";

// Le nombre de cartes qu'un tour sur une issue portant ces labels pose.
const cartesPour = (labels: string[]) => {
  const cartes: string[] = [];
  creerCarteBacklogVide({ envoyer: (texte) => void cartes.push(texte) }).boucle([{ number: 1, labels }]);
  return cartes.length;
};

for (const label of ["parked", "waiting", "blocked-on-human", "chef-todo", "question", "decision", "set-aside:failures", "served-elsewhere"]) {
  test(`an issue labelled ${label} is parked: nothing is left to cook`, () => {
    assert.equal(cartesPour([label]), 1);
  });
}

test("an issue with no label, or with fire, is cookable", () => {
  assert.equal(cartesPour([]), 0);
  assert.equal(cartesPour(["fire", "prio:1"]), 0);
});

test("a card that fails to be sent is sent again at the next loop", () => {
  const cartes: string[] = [];
  let echoue = true;
  const carte = creerCarteBacklogVide({
    envoyer: (texte) => {
      if (echoue) throw new Error("the TODO gate is down");
      cartes.push(texte);
    },
  });
  assert.throws(() => carte.boucle([]));
  echoue = false;
  carte.boucle([]);
  carte.boucle([]);
  assert.equal(cartes.length, 1);
});

test("the card is taken back once, when an issue becomes cookable after it", () => {
  let retraits = 0;
  const carte = creerCarteBacklogVide({ envoyer: () => {}, retirer: () => void retraits++ });
  carte.boucle([{ number: 1, labels: ["fire"] }]);
  assert.equal(retraits, 0);
  carte.boucle([]);
  carte.boucle([{ number: 1, labels: ["fire"] }]);
  carte.boucle([{ number: 1, labels: ["fire"] }]);
  assert.equal(retraits, 1);
});

test("a card already before the chef at start is not sent again", () => {
  const cartes: string[] = [];
  const carte = creerCarteBacklogVide({ envoyer: (texte) => void cartes.push(texte), envoyee: true });
  carte.boucle([]);
  assert.deepEqual(cartes, []);
});
