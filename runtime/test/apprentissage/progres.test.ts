// La livraison avant et après l'entrée d'une leçon ou d'un profil (`apprentissage/progres.ts`).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { avantApres } from "../../src/apprentissage/progres.ts";
import type { Parcours } from "../../src/renvois.ts";

// Un ticket pris le `jour`, mergé après `essais` essais (ou non mergé si `fin` est nul).
const ticket = (n: number, jour: string, essais: number, fin: "merged" | "served" | null = "merged"): Parcours => ({
  ticket: n,
  takenAt: `${jour}T10:00:00.000Z`,
  end: fin === null ? null : { kind: fin, at: `${jour}T12:00:00.000Z` },
  attempts: Array.from({ length: essais }, (_, i) => ({ run: `r${n}-${i}`, at: `${jour}T10:00:00.000Z`, outcome: null, verdict: null })),
});

describe("la livraison avant et après une date d'entrée", () => {
  test("des chiffres exacts de chaque côté : 2 sur 4 du premier coup avant, 3 sur 3 après", () => {
    const parcours = [
      ticket(1, "2026-10-01", 1),
      ticket(2, "2026-10-02", 3),
      ticket(3, "2026-10-03", 1),
      ticket(4, "2026-10-04", 2),
      ticket(5, "2026-10-10", 1),
      ticket(6, "2026-10-11", 1),
      ticket(7, "2026-10-12", 1),
    ];
    assert.deepEqual(avantApres(parcours, "2026-10-10"), {
      avant: { retenus: 4, premiers: 2, premierCoup: 0.5, essaisMoyens: 1.75 },
      apres: { retenus: 3, premiers: 3, premierCoup: 1, essaisMoyens: 1 },
    });
  });

  test("le jour même de l'entrée est d'après ; les tickets non mergés ne comptent d'aucun côté", () => {
    const parcours = [ticket(1, "2026-10-09", 1), ticket(2, "2026-10-10", 2), ticket(3, "2026-10-09", 1, null), ticket(4, "2026-10-11", 1, "served")];
    const { avant, apres } = avantApres(parcours, "2026-10-10");
    assert.equal(avant?.retenus, 1);
    assert.deepEqual(apres, { retenus: 1, premiers: 0, premierCoup: 0, essaisMoyens: 2 });
  });

  test("sans ticket avant, ou sans ticket après, le chiffre est absent — ni 0 ni NaN", () => {
    const parcours = [ticket(1, "2026-10-10", 1), ticket(2, "2026-10-11", 2)];
    assert.equal(avantApres(parcours, "2026-10-10").avant, null);
    assert.equal(avantApres(parcours, "2026-10-12").apres, null);
    assert.deepEqual(avantApres([], "2026-10-10"), { avant: null, apres: null });
    // Un côté qui n'a que des tickets non mergés est aussi absent.
    assert.equal(avantApres([ticket(1, "2026-10-01", 2, null)], "2026-10-10").avant, null);
  });
});
