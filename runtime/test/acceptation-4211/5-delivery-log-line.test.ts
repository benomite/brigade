// Test d'acceptation gelé (#4211), critère 5. Le contrat que ce test fixe, parce que le ticket le laisse ouvert :
// `runtime/src/rouge-de-charge/crochet.ts` exporte `enregistrerGatesRouges({ ticket, gates, lireCharge, essais, journal, rail })` ; `journal.ecrire(ligne)` reçoit une ligne par rouge de charge.
import assert from "node:assert/strict";
import { test } from "node:test";
import { enregistrerGatesRouges } from "../../src/rouge-de-charge/crochet.ts";

test("one delivery-log line says the red gate was caused by load, with the load value", async () => {
  const lignes: string[] = [];
  await enregistrerGatesRouges({ ticket: 4211, gates: { outcome: "red", failures: ["FAIL  x"], tail: "" } as never, lireCharge: () => 37.5, essais: { compter: () => 0, ajouter() {} }, journal: { ecrire: (l: string) => void lignes.push(l) }, rail: { remettre() {} } });
  assert.equal(lignes.length, 1);
  assert.match(lignes[0], /load/i);
  assert.match(lignes[0], /37\.5/);
});
