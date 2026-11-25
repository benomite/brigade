// #4213, critère 5 : sur 13 heures sans livraison simulées, la veille agit dans le délai, pas au bout des 13 heures.
// Contract: see 1-diagnostic-apres-delai.test.ts.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { creerVeille, DELAI_SANS_LIVRAISON_MS } from "../../src/veille-blocage/veille.ts";

const HEURE = 3_600_000;
const MINUTE = 60_000;
const BLOQUE = { charge: 0.5, cooks: 1, portes: [] as string[], boucles: [] as number[], restes: { processus: [4242], fichiers: [] as string[] }, disquePlein: false };

test("acts within the idle time over 13 faked hours", () => {
  const debut = 1_000_000_000_000;
  const t = { now: debut };
  const reparations: unknown[] = [];
  const veille = creerVeille({
    racine: mkdtempSync(join(tmpdir(), "veille-blocage-")),
    maintenant: () => t.now,
    dernierMerge: () => debut,
    attendent: () => 2,
    faits: () => BLOQUE,
    reparer: (a: unknown) => { reparations.push(a); },
    creerCarte: () => {},
    ecrire: () => {},
  });
  let agi: number | null = null;
  for (let min = 0; min <= 13 * 60; min++) {
    t.now = debut + min * MINUTE;
    veille.verifier();
    if (agi === null && reparations.length > 0) agi = t.now - debut;
  }
  assert.notEqual(agi, null);
  assert.equal(agi! <= DELAI_SANS_LIVRAISON_MS + 5 * MINUTE, true);
  assert.equal(DELAI_SANS_LIVRAISON_MS < 13 * HEURE, true);
});
