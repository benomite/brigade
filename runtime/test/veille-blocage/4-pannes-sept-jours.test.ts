// #4213, critère 4 : chaque panne machine qui atteint le chef est datée ; une fonction rend le compte des 7 derniers jours.
// Contract: see 1-diagnostic-apres-delai.test.ts.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createWatchdog, outagesInLastSevenDays } from "../../src/stall-watchdog/watchdog.ts";

const HEURE = 3_600_000;
const JOUR = 24 * HEURE;
const HUMAIN = { charge: 0.5, cooks: 1, portes: [] as string[], boucles: [] as number[], restes: { processus: [] as number[], fichiers: [] as string[] }, disquePlein: true };

test("counts the machine outages of the last 7 days", () => {
  const now = 1_000_000_000_000;
  const racine = mkdtempSync(join(tmpdir(), "veille-blocage-"));
  const veille = createWatchdog({
    racine,
    maintenant: () => now,
    dernierMerge: () => now - 100 * HEURE,
    attendent: () => 2,
    faits: () => HUMAIN,
    reparer: () => {},
    creerCarte: () => {},
    ecrire: () => {},
  });
  veille.verifier();
  assert.equal(outagesInLastSevenDays(racine, now), 1);
  assert.equal(outagesInLastSevenDays(racine, now + 6 * JOUR), 1);
  assert.equal(outagesInLastSevenDays(racine, now + 8 * JOUR), 0);
});
