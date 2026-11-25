// #4212, critère 6 : le plafond est une constante nommée ; un test la change et le comportement suit.
import assert from "node:assert/strict";
import { test } from "node:test";
import { PLAFOND_ESSAIS, creerPlafondEssais } from "../../src/plafond-essais/index.ts";

// Contrat attendu : creerPlafondEssais({ plafond?, arreter(n), commenter(n, corps), chef? }) rend
// { enregistrerEssai(n, { echec, charge? }), reecrire(n), total(n), peutLancer(n) }.
// `arreter` met le ticket en état arrêté ; `chef` (WAITING / carte TODO) ne doit jamais être appelé.
const monter = (plafond?: number) => {
  const commentaires: Array<{ n: number; corps: string }> = [];
  const arrets: number[] = [];
  const chef: string[] = [];
  const p = creerPlafondEssais({
    ...(plafond === undefined ? {} : { plafond }),
    arreter: async (n: number) => void arrets.push(n),
    commenter: async (n: number, corps: string) => void commentaires.push({ n, corps }),
    chef: { demanderAttente: () => void chef.push("WAITING"), creerCarteTodo: () => void chef.push("TODO") },
  });
  return { p, commentaires, arrets, chef };
};

test("the cap is one named constant and the behaviour follows it", async () => {
  assert.equal(typeof PLAFOND_ESSAIS, "number");
  assert.ok(Number.isInteger(PLAFOND_ESSAIS) && PLAFOND_ESSAIS > 1);
  for (const plafond of [2, 4]) {
    const { p, arrets } = monter(plafond);
    for (let i = 0; i < plafond - 1; i++) await p.enregistrerEssai(1, { echec: "f" });
    assert.equal(p.peutLancer(1), true);
    await p.enregistrerEssai(1, { echec: "f" });
    assert.equal(p.peutLancer(1), false);
    assert.deepEqual(arrets, [1]);
  }
  const { p } = monter();
  for (let i = 0; i < PLAFOND_ESSAIS - 1; i++) await p.enregistrerEssai(2, { echec: "f" });
  assert.equal(p.peutLancer(2), true);
  await p.enregistrerEssai(2, { echec: "f" });
  assert.equal(p.peutLancer(2), false);
});
