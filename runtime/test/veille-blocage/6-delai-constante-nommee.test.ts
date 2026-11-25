// #4213, critère 6 : le délai est une seule constante nommée, et le comportement la suit.
// Contract: see 1-diagnostic-apres-delai.test.ts.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { creerVeille, DELAI_SANS_LIVRAISON_MS } from "../../src/veille-blocage/veille.ts";

const HEURE = 3_600_000;
const SAINS = { charge: 0.5, cooks: 1, portes: [] as string[], boucles: [] as number[], restes: { processus: [] as number[], fichiers: [] as string[] }, disquePlein: false };

function monter(delaiMs: number) {
  const now = 1_000_000_000_000;
  const compte = { faits: 0 };
  const veille = creerVeille({
    racine: mkdtempSync(join(tmpdir(), "veille-blocage-")),
    maintenant: () => now,
    dernierMerge: () => now - 2 * HEURE,
    attendent: () => 2,
    faits: () => { compte.faits++; return SAINS; },
    reparer: () => {},
    creerCarte: () => {},
    ecrire: () => {},
    delaiMs,
  });
  return { compte, veille };
}

test("the behaviour follows the idle time", () => {
  assert.equal(typeof DELAI_SANS_LIVRAISON_MS, "number");
  const court = monter(HEURE);
  court.veille.verifier();
  assert.equal(court.compte.faits > 0, true);
  const long = monter(3 * HEURE);
  long.veille.verifier();
  assert.equal(long.compte.faits, 0);
});
