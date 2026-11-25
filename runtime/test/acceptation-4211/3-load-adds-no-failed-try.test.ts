// Test d'acceptation gelé (#4211), critère 3. Le contrat que ce test fixe, parce que le ticket le laisse ouvert :
// `runtime/src/rouge-de-charge/crochet.ts` exporte `enregistrerGatesRouges({ ticket, gates, lireCharge, essais, journal, rail })` -> `Promise<{ classe: "load" | "code" }>`.
// `essais` : `{ compter(ticket): number, ajouter(ticket): void }` (essais ratés) ; `journal` : `{ ecrire(ligne: string): void }` ; `rail` : `{ remettre(ticket): void }`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { enregistrerGatesRouges } from "../../src/rouge-de-charge/crochet.ts";

test("a red gate classified load leaves the failed-try count of the ticket unchanged", async () => {
  const n = new Map<number, number>([[4211, 1]]);
  const essais = { compter: (t: number) => n.get(t) ?? 0, ajouter: (t: number) => void n.set(t, (n.get(t) ?? 0) + 1) };
  const avant = essais.compter(4211);
  const res = await enregistrerGatesRouges({ ticket: 4211, gates: { outcome: "red", failures: ["FAIL  x"], tail: "" } as never, lireCharge: () => 40, essais, journal: { ecrire() {} }, rail: { remettre() {} } });
  assert.equal(res.classe, "load");
  assert.equal(essais.compter(4211), avant);
});
