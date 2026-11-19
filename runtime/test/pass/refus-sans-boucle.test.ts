// #3852 critère 3 : le refus ne boucle pas. Le brief du cook renvoyé dit comment
// marquer une garde quand les critères disent « as before » / « unchanged », et
// qu'un second refus se règle une fois : marquer, ou écarter avec la raison en une ligne.
import assert from "node:assert/strict";
import { test } from "node:test";
import { consigneDuDesaccord } from "../../src/desaccord-cook.ts";

test("the returned cook's brief says how to mark a guard and that a second refusal is settled once, not looped", () => {
  const consigne = consigneDuDesaccord(42);
  assert.match(consigne, /brigade:guard/);
  assert.match(consigne, /as before/);
  assert.match(consigne, /unchanged/);
  assert.match(consigne, /set (the ticket )?aside/i);
  assert.match(consigne, /one line/);
  assert.doesNotMatch(consigne, /does not lift it/);
});
