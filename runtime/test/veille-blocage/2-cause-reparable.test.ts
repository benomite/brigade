// #4213, critère 2 : une cause réparable est réparée, une ligne de journal dit la cause et l'action, aucune carte TODO.
// Contract: see 1-diagnostic-apres-delai.test.ts.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { creerVeille } from "../../src/veille-blocage/veille.ts";

const HEURE = 3_600_000;
const BLOQUE = { charge: 0.5, cooks: 1, portes: [] as string[], boucles: [] as number[], restes: { processus: [4242], fichiers: [] as string[] }, disquePlein: false };

test("repairs leftover processes, logs one line, creates no card", () => {
  const now = 1_000_000_000_000;
  const reparations: unknown[] = [];
  const cartes: unknown[] = [];
  const lignes: string[] = [];
  const veille = creerVeille({
    racine: mkdtempSync(join(tmpdir(), "veille-blocage-")),
    maintenant: () => now,
    dernierMerge: () => now - 100 * HEURE,
    attendent: () => 2,
    faits: () => BLOQUE,
    reparer: (a: unknown) => { reparations.push(a); },
    creerCarte: (c: unknown) => { cartes.push(c); },
    ecrire: (l: string) => { lignes.push(l); },
  });
  veille.verifier();
  assert.equal(reparations.length, 1);
  assert.equal(lignes.length, 1);
  assert.match(lignes[0]!, /4242|process/i);
  assert.deepEqual(cartes, []);
});
