// Le contrôleur des invariants du rail (#4026) : chaque contrôle une fois par
// tour ; un contrôle qui échoue est dit, sans retenir les autres ni le tour ; une
// base rouge relancée retient les autres réparations jusqu'à son résultat.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Invariant } from "../../src/invariants/invariants.ts";
import { CALIBRE, FauxGitHub } from "../faux-github.ts";

test("a check that fails is said, and neither the other checks nor the tick stop", async () => {
  const faux = new FauxGitHub();
  faux.feu(1, CALIBRE);
  const avertis: string[] = [];
  let suivant = 0;
  const invariants: Invariant[] = [
    async () => {
      throw new Error("GitHub said 502");
    },
    async () => void (suivant += 1),
  ];
  const a = faux.station("A", { places: 1, sauter: () => {}, avertir: (texte) => avertis.push(texte), cuisiner: async () => ({ echec: "not the point" }), invariants });
  await a.tour();
  await a.calme();
  assert.equal(suivant, 1);
  assert.match(avertis.join("\n"), /an invariant of the rail could not be checked on A, checked again next turn — GitHub said 502/);
  assert.equal(faux.cuissons.length, 1);
});

test("while the red base's rerun has no result, no other invariant is repaired", async () => {
  const faux = new FauxGitHub();
  faux.base = "red";
  faux.feu(1, [...CALIBRE, "waiting"]);
  const a = faux.station("A", { places: 1, sauter: () => {}, avertir: () => {}, relancerLaBase: async () => {} });
  await a.tour();
  await a.calme();
  assert.deepEqual(faux.commentaires.get(1) ?? [], [], "nothing written before the rerun's result");
  await a.tour();
  await a.calme();
  assert.match((faux.commentaires.get(1) ?? []).map((c) => c.body).join("\n"), /Invariant 3 broke/);
});
