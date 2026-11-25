// Test d'acceptation gelé (#4211), critère 6. Le contrat : `enregistrerGatesRouges({ ticket, gates, lireCharge, essais, journal, rail })` de
// `runtime/src/rouge-de-charge/crochet.ts` -> `{ classe }` ; sur un rouge `code`, `essais.ajouter(ticket)` est appelé une fois et `rail.remettre` ne l'est pas.
import assert from "node:assert/strict";
import { test } from "node:test";
import { enregistrerGatesRouges } from "../../src/rouge-de-charge/crochet.ts";

test("a red gate classified code still counts as a failed try", async () => {
  const n = new Map<number, number>([[4211, 1]]);
  const essais = { compter: (t: number) => n.get(t) ?? 0, ajouter: (t: number) => void n.set(t, (n.get(t) ?? 0) + 1) };
  const res = await enregistrerGatesRouges({ ticket: 4211, gates: { outcome: "red", failures: ["FAIL  x"], tail: "" } as never, lireCharge: () => 0.2, essais, journal: { ecrire() {} }, rail: { remettre() { assert.fail("not put back"); } } });
  assert.equal(res.classe, "code");
  assert.equal(essais.compter(4211), 2);
});
