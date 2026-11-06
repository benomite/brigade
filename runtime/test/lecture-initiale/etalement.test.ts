import assert from "node:assert/strict";
import { test } from "node:test";
import { brancherBrigadeGithub, type StationGitHub } from "../../src/brigade-github.ts";
import { departDuProjet, FENETRE_PAR_DEFAUT_MS, fenetreDe } from "../../src/lecture-initiale/etalement.ts";

const fini = async () => {
  for (let i = 0; i < 10; i += 1) await new Promise<void>((resoudre) => queueMicrotask(resoudre));
};

// Ouvre `n` projets comme la station : le rang est le nombre déjà ouverts.
const ouvrirTous = (t: import("node:test").TestContext, n: number, fenetreMs: number, intervalleMs = 120_000) => {
  const lectures: Array<{ projet: number; a: number }> = [];
  for (let rang = 0; rang < n; rang += 1) {
    const station: StationGitHub = { tour: async () => void lectures.push({ projet: rang, a: Date.now() }), enCuisine: () => [], calme: async () => {}, relu: async () => {} };
    const ouvert = brancherBrigadeGithub({ station: () => station, intervalleMs, premierTourMs: departDuProjet(rang, n, fenetreMs), avertir: () => {} });
    t.after(() => ouvert.arreter());
  }
  return lectures;
};

test("cinq projets, fenêtre par défaut : cinq premières lectures à cinq instants distincts, régulièrement étalés sur la fenêtre (#2587)", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const lectures = ouvrirTous(t, 5, FENETRE_PAR_DEFAUT_MS);
  await fini();
  for (let s = 0; s < 300; s += 1) {
    t.mock.timers.tick(1000);
    await fini();
  }
  const premieres = [0, 1, 2, 3, 4].map((p) => lectures.find((l) => l.projet === p)?.a);
  assert.deepEqual(premieres, [0, 60_000, 120_000, 180_000, 240_000]);
  assert.equal(new Set(premieres.map((a) => Math.floor((a ?? 0) / 1000))).size, 5);
  assert.ok(premieres.every((a) => (a ?? Infinity) < FENETRE_PAR_DEFAUT_MS));
});

test("une fenêtre de 0 : toutes les premières lectures partent à la fois, comme avant (#2587)", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const lectures = ouvrirTous(t, 5, 0);
  await fini();
  assert.deepEqual(lectures.map((l) => l.a), [0, 0, 0, 0, 0]);
  assert.deepEqual([0, 1, 2, 3, 4].map((r) => departDuProjet(r, 5, 0)), [0, 0, 0, 0, 0]);
});

test("un projet seul n'est jamais retardé, et aucun ne l'est de plus que la fenêtre (#2587)", () => {
  assert.equal(departDuProjet(0, 1, FENETRE_PAR_DEFAUT_MS), 0);
  for (const total of [1, 2, 3, 5, 12]) for (let rang = 0; rang < total; rang += 1) assert.ok(departDuProjet(rang, total, FENETRE_PAR_DEFAUT_MS) <= FENETRE_PAR_DEFAUT_MS);
});

test("après sa première lecture, un projet est relu à sa cadence habituelle (#2587)", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const lectures = ouvrirTous(t, 5, FENETRE_PAR_DEFAUT_MS, 120_000);
  await fini();
  for (let s = 0; s < 480; s += 1) {
    t.mock.timers.tick(1000);
    await fini();
  }
  const duTroisieme = lectures.filter((l) => l.projet === 2).map((l) => l.a);
  assert.deepEqual(duTroisieme, [120_000, 240_000, 360_000, 480_000]);
});

test("la fenêtre se règle en secondes entières, 0 permis ; cinq minutes à défaut (#2587)", () => {
  assert.equal(fenetreDe(undefined), 300_000);
  assert.equal(fenetreDe("0"), 0);
  assert.equal(fenetreDe("90"), 90_000);
  assert.equal(fenetreDe("-1"), null);
  assert.equal(fenetreDe("1.5"), null);
  assert.equal(fenetreDe(""), null);
});
