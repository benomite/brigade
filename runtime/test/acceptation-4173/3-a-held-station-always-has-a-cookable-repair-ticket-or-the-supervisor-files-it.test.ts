// Test d'acceptation gelé (#4173), critère 3. Le contrat que ce test fixe, parce que le ticket le laisse ouvert :
// `runtime/src/reparation.ts` exporte `garantirUneReparationDeSaturation({ retenue, ouverts, creer })` -> `Promise<{ cookable: number | null; deposee: number | null }>`.
// `retenue` : la retenue de la station ("machine" | "breaker" | null) ; `ouverts` : `{ numero, labels }[]` les tickets cookables ;
// `creer({ titre, corps, labels })` -> `Promise<number>` : le dépôt du ticket par le superviseur.
// Station retenue pour la machine : une réparation cookable existe, sinon le superviseur en dépose une, avec `saturation-repair`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { garantirUneReparationDeSaturation } from "../../src/reparation.ts";

function creerFaux() {
  const crees: { titre: string; corps: string; labels: string[] }[] = [];
  return { crees, creer: async (t: { titre: string; corps: string; labels: string[] }) => { crees.push(t); return 900 + crees.length; } };
}

test("held for the machine with no repair ticket: the supervisor files exactly one, labelled `saturation-repair`", async () => {
  const { crees, creer } = creerFaux();
  const res = await garantirUneReparationDeSaturation({ retenue: "machine", ouverts: [{ numero: 5, labels: ["feature"] }], creer });
  assert.equal(crees.length, 1);
  assert.ok(crees[0]!.labels.includes("saturation-repair"));
  assert.equal(res.deposee, 901);
  assert.equal(res.cookable, 901);
});

test("held for the machine with a repair ticket already cookable: nothing is filed", async () => {
  const { crees, creer } = creerFaux();
  const res = await garantirUneReparationDeSaturation({ retenue: "machine", ouverts: [{ numero: 5, labels: ["feature"] }, { numero: 7, labels: ["saturation-repair"] }], creer });
  assert.equal(crees.length, 0);
  assert.equal(res.cookable, 7);
  assert.equal(res.deposee, null);
});

test("a station not held for the machine files nothing", async () => {
  const { crees, creer } = creerFaux();
  for (const retenue of [null, "breaker"] as const) await garantirUneReparationDeSaturation({ retenue, ouverts: [], creer });
  assert.equal(crees.length, 0);
});
