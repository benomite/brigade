// #3515, critère 2 : Brigade produit deux comptes par période, « escaped bugs » et « reverts », sur la même définition de
// période que les autres chiffres (les tickets mergés dans la période, avec `fire`).
// Test d'acceptation : le calcul du runtime sur l'échantillon commité, sans GitHub.
import assert from "node:assert/strict";
import { test } from "node:test";
import { chiffresDAutonomie, PERIODES } from "../../src/autonomie/chiffres/chiffres.ts";
import { ECHANTILLON, MAINTENANT, sha } from "./echantillon.ts";

test("each period gives both counts, over the same tickets as the other figures", () => {
  for (const jours of PERIODES) {
    const chiffres = chiffresDAutonomie([ECHANTILLON], jours, MAINTENANT);
    assert.ok(Array.isArray(chiffres.bugsEchappes), `no escaped bugs over ${jours} days`);
    assert.ok(Array.isArray(chiffres.reverts), `no reverts over ${jours} days`);
  }
  // #90, merged 22 days ago, is a ticket of the 30 days, not of the 7: its bug #204 and its revert cccc… follow it.
  const sept = chiffresDAutonomie([ECHANTILLON], 7, MAINTENANT);
  const trente = chiffresDAutonomie([ECHANTILLON], 30, MAINTENANT);
  assert.deepEqual([sept.tickets, trente.tickets], [4, 5]);
  assert.ok(!sept.bugsEchappes?.some(({ bug }) => bug === 204));
  assert.ok(trente.bugsEchappes?.some(({ bug }) => bug === 204));
  assert.ok(!sept.reverts?.some((revert) => revert.sha === sha("c")));
  assert.ok(trente.reverts?.some((revert) => revert.sha === sha("c")));
});
