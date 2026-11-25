// #4212, critère 3 : au plafond, le ticket passe à l'arrêt et un seul commentaire donne plafond, compte, dernier échec.
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

test("reaching the cap stops the ticket and posts one comment with cap, count and last failure", async () => {
  const { p, commentaires, arrets } = monter(3);
  await p.enregistrerEssai(11, { echec: "first failure" });
  await p.enregistrerEssai(11, { echec: "second failure" });
  assert.equal(commentaires.length, 0);
  await p.enregistrerEssai(11, { echec: "typecheck failed in src/x.ts" });
  assert.deepEqual(arrets, [11]);
  assert.equal(commentaires.length, 1);
  assert.equal(commentaires[0].n, 11);
  assert.match(commentaires[0].corps, /\b3\b/);
  assert.match(commentaires[0].corps, /typecheck failed in src\/x\.ts/);
  assert.match(commentaires[0].corps, /cap/i);
  assert.doesNotMatch(commentaires[0].corps, /second failure/);
});
