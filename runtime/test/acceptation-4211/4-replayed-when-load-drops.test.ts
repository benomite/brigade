// Test d'acceptation gelé (#4211), critère 4. Le contrat que ce test fixe, parce que le ticket le laisse ouvert :
// `runtime/src/rouge-de-charge/crochet.ts` exporte `enregistrerGatesRouges({ ticket, gates, lireCharge, essais, journal, rail })` (`rail.remettre(ticket)` remet le ticket sur le rail)
// et `rejouerQuandCalme({ tickets, lireCharge, rail, rejouer })` -> `Promise<void>` : appelle `rejouer(ticket)` pour chaque ticket remis dès que `lireCharge()` est repassée sous le seuil, et pas avant.
import assert from "node:assert/strict";
import { test } from "node:test";
import { enregistrerGatesRouges, rejouerQuandCalme } from "../../src/rouge-de-charge/crochet.ts";

test("a ticket whose gate failed for load is put back on the rail and replayed once the faked load drops", async () => {
  let charge = 40;
  const remis: number[] = [];
  const rejoues: number[] = [];
  const rail = { remettre: (t: number) => void remis.push(t) };
  const essais = { compter: () => 0, ajouter() {} };
  await enregistrerGatesRouges({ ticket: 4211, gates: { outcome: "red", failures: ["FAIL  x"], tail: "" } as never, lireCharge: () => charge, essais, journal: { ecrire() {} }, rail });
  assert.deepEqual(remis, [4211]);
  const rejouer = (t: number) => void rejoues.push(t);
  await rejouerQuandCalme({ tickets: remis, lireCharge: () => charge, rail, rejouer });
  assert.deepEqual(rejoues, [], "no replay while the machine is loaded");
  charge = 0.3;
  await rejouerQuandCalme({ tickets: remis, lireCharge: () => charge, rail, rejouer });
  assert.deepEqual(rejoues, [4211]);
});
