import assert from "node:assert/strict";
import { test } from "node:test";
import { direCarteEn, jugerCarte } from "../../src/carte-todo.ts";
import { BESOINS, qualifierCarte, RAISONS } from "../../src/carte-chef/carte-chef.ts";

const admise = (demande: Parameters<typeof qualifierCarte>[0]) => {
  const q = qualifierCarte(demande);
  assert.ok(q.admise, q.admise ? "" : q.erreur);
  return q.carte;
};

test("a product choice states its reason", () => {
  assert.match(admise({ raison: "product-choice", texte: "Pick one." }).texte, /^Product choice\. Pick one\.$/);
});

test("a design choice states its reason", () => {
  assert.match(admise({ raison: "design-choice", texte: "Pick one." }).texte, /^Design choice\./);
});

test("a review only the chef can make states its reason", () => {
  assert.match(admise({ raison: "chef-review", texte: "Read it." }).texte, /^Review only the chef can make\./);
});

for (const [besoin, dit] of [["account", /chef's account/], ["machine", /chef's machine/], ["secret", /secret/]] as const) {
  test(`a gesture that needs the chef states its need: ${besoin}`, () => {
    const carte = admise({ raison: "chef-gesture", besoin, texte: "Do it." });
    assert.match(carte.texte, /^Gesture that needs the chef: it /);
    assert.match(carte.texte, dit);
    assert.equal(carte.besoin, besoin);
  });
}

test("a gesture without its need, or with an unknown one, is refused naming the needs", () => {
  for (const besoin of [undefined, null, "", "wish"]) {
    const q = qualifierCarte({ raison: "chef-gesture", besoin, texte: "Do it." });
    assert.equal(q.admise, false);
    if (!q.admise) for (const b of BESOINS) assert.ok(q.erreur.includes(b));
  }
});

test("no reason, or an unknown one, is refused naming the four allowed reasons", () => {
  for (const raison of [undefined, null, "", "  ", "technical-merge"]) {
    const q = qualifierCarte({ raison, texte: "Ask." });
    assert.equal(q.admise, false);
    if (!q.admise) for (const r of RAISONS) assert.ok(q.erreur.includes(r), q.erreur);
  }
});

test("the door gives a card its reason, in the line the chef reads", () => {
  const proposition = { type: "product", resume: "The ticket adds a list. It can be per project or shared.", enonce: "One list per project, or one for all?", choix: [{ texte: "Per project." }, { texte: "For all." }] };
  const jugement = jugerCarte(proposition);
  assert.ok(jugement.admise);
  if (!jugement.admise) return;
  assert.equal(jugement.carte.raison, "product-choice");
  assert.match(direCarteEn(jugement.carte), /^product \(product choice\): One list/);
});

test("the door refuses a card whose reason is not one of the four, naming them", () => {
  const jugement = jugerCarte({ type: "product", raison: "technical-merge", resume: "The ticket adds a list.", enonce: "Merge it?", choix: [{ texte: "Yes." }, { texte: "No." }] });
  assert.equal(jugement.admise, false);
  if (!jugement.admise) for (const r of RAISONS) assert.ok(jugement.raison.includes(r), jugement.raison);
});
