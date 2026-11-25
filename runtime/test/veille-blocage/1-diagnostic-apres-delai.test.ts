// #4213, critère 1 : après le délai sans livraison et avec un ticket en attente, la veille diagnostique ; sinon, rien.
// Contract fixed by these acceptance tests (watchdog in runtime/src/veille-blocage/veille.ts):
//   creerVeille({ racine, maintenant, dernierMerge, attendent, faits, reparer, creerCarte, ecrire, delaiMs? }) -> { verifier(): void }
//   DELAI_SANS_LIVRAISON_MS : the one named idle-time constant (used when delaiMs is not given)
//   pannesDesSeptJours(racine, maintenant): number : machine outages that reached the chef in the last 7 days
// faits() returns { charge, cooks, portes, boucles, restes: { processus: number[], fichiers: string[] }, disquePlein }.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { creerVeille, DELAI_SANS_LIVRAISON_MS } from "../../src/veille-blocage/veille.ts";

const HEURE = 3_600_000;
const SAINS = { charge: 0.5, cooks: 1, portes: [] as string[], boucles: [] as number[], restes: { processus: [] as number[], fichiers: [] as string[] }, disquePlein: false };

function monter(opts: { attendent?: number; dernierMerge?: number | null } = {}) {
  const t = { now: 1_000_000_000_000 };
  const appels = { faits: 0, reparations: [] as unknown[], cartes: [] as unknown[], lignes: [] as string[] };
  const veille = creerVeille({
    racine: mkdtempSync(join(tmpdir(), "veille-blocage-")),
    maintenant: () => t.now,
    dernierMerge: () => (opts.dernierMerge === undefined ? t.now - 100 * HEURE : opts.dernierMerge),
    attendent: () => opts.attendent ?? 2,
    faits: () => { appels.faits++; return SAINS; },
    reparer: (action: unknown) => { appels.reparations.push(action); },
    creerCarte: (c: unknown) => { appels.cartes.push(c); },
    ecrire: (l: string) => { appels.lignes.push(l); },
  });
  return { appels, veille };
}

test("diagnoses after the idle time with a waiting ticket", () => {
  const m = monter({ dernierMerge: 1_000_000_000_000 - DELAI_SANS_LIVRAISON_MS - 1 });
  m.veille.verifier();
  assert.equal(m.appels.faits > 0, true);
});

test("does nothing with an empty rail", () => {
  const m = monter({ attendent: 0 });
  m.veille.verifier();
  assert.equal(m.appels.faits, 0);
  assert.deepEqual([m.appels.reparations, m.appels.cartes, m.appels.lignes], [[], [], []]);
});

test("does nothing after a recent merge", () => {
  const m = monter({ dernierMerge: 1_000_000_000_000 - 1000 });
  m.veille.verifier();
  assert.equal(m.appels.faits, 0);
  assert.deepEqual([m.appels.reparations, m.appels.cartes, m.appels.lignes], [[], [], []]);
});
