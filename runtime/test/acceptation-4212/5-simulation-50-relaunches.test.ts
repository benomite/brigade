// #4212, critère 5 : 50 relances d'un ticket — il s'arrête au plafond, les autres continuent.
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

test("50 relaunches of one ticket stop at the cap while other tickets keep going", async () => {
  const { p, arrets, commentaires } = monter(6);
  let lancements = 0;
  for (let i = 0; i < 50; i++) {
    if (i % 2 === 1) p.reecrire(4064);
    if (p.peutLancer(4064)) {
      lancements++;
      await p.enregistrerEssai(4064, { echec: `failure ${i}` });
    }
    assert.equal(p.peutLancer(4065), true);
    await p.enregistrerEssai(4065, { echec: "x", charge: true });
  }
  assert.equal(lancements, 6);
  assert.equal(p.total(4064), 6);
  assert.equal(p.peutLancer(4064), false);
  assert.deepEqual(arrets, [4064]);
  assert.equal(commentaires.length, 1);
  assert.equal(p.peutLancer(4065), true);
});
