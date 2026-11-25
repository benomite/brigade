// #4212, critère 2 : quand le total atteint le plafond, le ticket n'est plus lancé.
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

test("a ticket whose total reaches the cap is not launched again", async () => {
  const { p } = monter(3);
  for (let i = 0; i < 2; i++) await p.enregistrerEssai(7, { echec: "boom" });
  assert.equal(p.peutLancer(7), true);
  await p.enregistrerEssai(7, { echec: "boom" });
  assert.equal(p.total(7), 3);
  assert.equal(p.peutLancer(7), false);
  p.reecrire(7);
  assert.equal(p.peutLancer(7), false);
});
