import assert from "node:assert/strict";
import { test } from "node:test";
import { direCarteEn, jugerCarte, type Proposition } from "../../src/carte-todo.ts";
import { BESOINS, direLaRaison, qualifierCarte, RAISONS } from "../../src/carte-chef/carte-chef.ts";

const admise = (demande: Parameters<typeof qualifierCarte>[0]) => {
  const q = qualifierCarte(demande);
  assert.ok(q.admise, q.admise ? "" : q.erreur);
  return q.carte;
};

const CARTE = { resume: "The ticket adds a list. It can be per project or shared.", enonce: "One list per project, or one for all?", choix: [{ texte: "Per project." }, { texte: "For all." }] };
const entree = (proposition: Proposition) => {
  const jugement = jugerCarte(proposition);
  assert.ok(jugement.admise, jugement.admise ? "" : jugement.raison);
  return jugement.admise ? jugement.carte : (undefined as never);
};

test("each of the four reasons is admitted and read as such", () => {
  const dites = RAISONS.map((raison) => direLaRaison(admise({ raison, besoin: "account" }).raison, null));
  assert.deepEqual(dites, ["Product choice", "Design choice", "Review only the chef can make", "Gesture that needs the chef"]);
});

for (const [besoin, dit] of [["account", /chef's account/], ["machine", /chef's machine/], ["secret", /secret/]] as const) {
  test(`a gesture that needs the chef states its need: ${besoin}`, () => {
    const carte = admise({ raison: "chef-gesture", besoin });
    assert.equal(carte.besoin, besoin);
    assert.match(direLaRaison(carte.raison, carte.besoin), dit);
  });
}

test("a gesture without its need, or with an unknown one, is refused naming the needs", () => {
  for (const besoin of [undefined, null, "", "wish"]) {
    const q = qualifierCarte({ raison: "chef-gesture", besoin });
    assert.equal(q.admise, false);
    if (!q.admise) for (const b of BESOINS) assert.ok(q.erreur.includes(b));
  }
});

test("no reason, or an unknown one, is refused naming the four allowed reasons", () => {
  for (const raison of [undefined, null, "", "  ", "technical-merge"]) {
    const q = qualifierCarte({ raison });
    assert.equal(q.admise, false);
    if (!q.admise) for (const r of RAISONS) assert.ok(q.erreur.includes(r), q.erreur);
  }
});

test("through the door, a product card and a design card state their reason in the line the chef reads", () => {
  assert.match(direCarteEn(entree({ ...CARTE, type: "product" })), /^product: Product choice\. One list/);
  const ecrans = { sha: "c0ffee", screens: [{ screen: "rail-vide", before: "docs/captures/2/rail-vide-avant.png", after: "docs/captures/2/rail-vide-apres.png" }] };
  const jugement = jugerCarte({ ...CARTE, type: "design" }, ecrans);
  assert.ok(jugement.admise);
  if (jugement.admise) assert.match(direCarteEn(jugement.carte), /^design: Design choice\. One list/);
});

test("through the door, a review only the chef can make is a card that says so", () => {
  const carte = entree({ ...CARTE, raison: "chef-review" });
  assert.equal(carte.raison, "chef-review");
  assert.match(direCarteEn(carte), /: Review only the chef can make\. One list/);
});

for (const besoin of BESOINS) {
  test(`through the door, a gesture that needs the chef states what it needs: ${besoin}`, () => {
    const carte = entree({ ...CARTE, raison: "chef-gesture", besoin });
    assert.equal(carte.besoin, besoin);
    assert.match(direCarteEn(carte), /: Gesture that needs the chef: it needs .*\. One list/);
  });
}

test("the door refuses a gesture that does not say what it needs", () => {
  const jugement = jugerCarte({ ...CARTE, raison: "chef-gesture" });
  assert.equal(jugement.admise, false);
  if (!jugement.admise) for (const b of BESOINS) assert.ok(jugement.raison.includes(b), jugement.raison);
});

test("the door refuses a card whose reason is not one of the four, naming them", () => {
  for (const raison of ["technical-merge"]) {
    const jugement = jugerCarte({ ...CARTE, type: "product", raison });
    assert.equal(jugement.admise, false);
    if (!jugement.admise) for (const r of RAISONS) assert.ok(jugement.raison.includes(r), jugement.raison);
  }
});

test("the door refuses a reason that contradicts the kind of the card", () => {
  assert.equal(jugerCarte({ ...CARTE, type: "design", raison: "product-choice" }).admise, false);
  assert.equal(jugerCarte({ ...CARTE, type: "product", raison: "design-choice" }).admise, false);
});
