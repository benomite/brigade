// Admission à la charge (#4210) : un rail de 2000 tickets et une machine
// simulée. Le nombre d'unités concurrentes ne dépasse jamais le maximum admis ;
// les tickets non admis restent sur le rail et partent quand la capacité revient.
import assert from "node:assert/strict";
import { test } from "node:test";
import { admettre, plafondAdmis } from "../../src/admission-charge/admission-charge.ts";

test("2000 tickets, une machine à 8 cœurs : jamais plus que le plafond, tous cuisinés à la fin", () => {
  const COEURS = 8;
  const plafond = plafondAdmis(COEURS);
  const rail: number[] = Array.from({ length: 2000 }, (_, i) => i + 1);
  const enVol = new Map<number, number>(); // ticket -> tours restants
  const faits: number[] = [];
  let maxVu = 0;
  let refusesPendantLaPointe = 0;
  for (let tour = 0; tour < 100_000 && (rail.length > 0 || enVol.size > 0); tour++) {
    // Une pointe de charge extérieure au début : rien ne doit partir, tout reste sur le rail.
    const pointe = tour < 20 ? 27 : 0;
    const lireMachine = () => ({ charge: pointe + enVol.size, coeurs: COEURS });
    while (rail.length > 0) {
      const verdict = admettre({ genre: "cook", enCours: enVol.size, lireMachine, avertir: () => {} });
      if (!verdict.admis) break;
      enVol.set(rail.shift() as number, 3);
      maxVu = Math.max(maxVu, enVol.size);
    }
    if (pointe > 0) {
      assert.equal(enVol.size, 0, "rien ne part pendant la pointe");
      assert.equal(rail.length, 2000, "les tickets restent sur le rail");
      refusesPendantLaPointe++;
    }
    for (const [ticket, reste] of enVol) {
      if (reste <= 1) {
        enVol.delete(ticket);
        faits.push(ticket);
      } else enVol.set(ticket, reste - 1);
    }
  }
  assert.ok(refusesPendantLaPointe > 0);
  assert.ok(maxVu >= 1 && maxVu <= plafond, `${maxVu} unités concurrentes pour un plafond de ${plafond}`);
  assert.equal(faits.length, 2000);
  assert.equal(new Set(faits).size, 2000);
});
