// #4213, critère 3 : une cause humaine crée exactement une carte TODO pour le chef, jamais deux pour la même cause.
// Contract: see 1-diagnostic-apres-delai.test.ts.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createWatchdog } from "../../src/stall-watchdog/watchdog.ts";

const HEURE = 3_600_000;
const HUMAIN = { charge: 0.5, cooks: 1, portes: [] as string[], boucles: [] as number[], restes: { processus: [] as number[], fichiers: [] as string[] }, disquePlein: true };

test("creates exactly one card in plain words, and no second one on the same cause", () => {
  const t = { now: 1_000_000_000_000 };
  const reparations: unknown[] = [];
  const cartes: { cause: string; texte: string }[] = [];
  const veille = createWatchdog({
    racine: mkdtempSync(join(tmpdir(), "veille-blocage-")),
    maintenant: () => t.now,
    dernierMerge: () => 1_000_000_000_000 - 100 * HEURE,
    attendent: () => 2,
    faits: () => HUMAIN,
    reparer: (a: unknown) => { reparations.push(a); },
    creerCarte: (c: { cause: string; texte: string }) => { cartes.push(c); },
    ecrire: () => {},
  });
  veille.verifier();
  assert.equal(cartes.length, 1);
  assert.match(cartes[0]!.texte, /\S+ \S+ \S+/);
  assert.deepEqual(reparations, []);
  t.now += HEURE;
  veille.verifier();
  assert.equal(cartes.length, 1);
});
