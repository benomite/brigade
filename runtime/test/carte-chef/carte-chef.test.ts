import assert from "node:assert/strict";
import { test } from "node:test";
import { BESOINS, direLaRaison, qualifierCarte, RAISONS } from "../../src/carte-chef/carte-chef.ts";

const admise = (demande: Parameters<typeof qualifierCarte>[0]) => {
  const q = qualifierCarte(demande);
  assert.ok(q.admise, q.admise ? "" : q.erreur);
  return q.carte;
};

test("each of the four reasons is admitted and read as such", () => {
  const dites = RAISONS.map((raison) => {
    const carte = admise({ raison, besoin: raison === "chef-gesture" ? "account" : null });
    assert.equal(carte.raison, raison);
    return direLaRaison(carte.raison, carte.besoin);
  });
  assert.deepEqual(dites, ["Product choice", "Design choice", "Review only the chef can make", "Gesture that needs the chef: it needs the chef's account"]);
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

test("no reason, a blank one, or an unknown one, is refused naming the four allowed reasons", () => {
  for (const raison of [undefined, null, "", "  ", "technical-merge"]) {
    const q = qualifierCarte({ raison });
    assert.equal(q.admise, false);
    if (!q.admise) for (const r of RAISONS) assert.ok(q.erreur.includes(r), q.erreur);
  }
});
