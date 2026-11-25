// #4212, critère 4 : aucun appel au chef (ni WAITING ni carte TODO) pour le plafond lui-même.
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

test("reaching the cap makes no call to the chef", async () => {
  const { p, chef, arrets } = monter(2);
  await p.enregistrerEssai(5, { echec: "a" });
  await p.enregistrerEssai(5, { echec: "b" });
  assert.deepEqual(arrets, [5]);
  assert.deepEqual(chef, []);
});
