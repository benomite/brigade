import assert from "node:assert/strict";
import { test } from "node:test";
import { lireReglages } from "../src/plafonds.ts";
import { ConfigInvalide } from "../src/runtime.ts";

test("sans rien régler, les plafonds sont ceux que le chef a fixés", () => {
  assert.deepEqual(lireReglages({}), {
    plafonds: { turns: 100, durationMs: 60 * 60_000, tokens: 2_000_000, idleMs: 10 * 60_000 },
    seuilDisjoncteur: 3,
    graceMs: 10_000,
  });
});

test("chaque plafond se règle par sa variable d'environnement", () => {
  const reglages = lireReglages({
    BRIGADE_MAX_TURNS: "40",
    BRIGADE_MAX_MINUTES: "20",
    BRIGADE_MAX_TOKENS: "500000",
    BRIGADE_IDLE_MINUTES: "2.5",
    BRIGADE_BREAKER_FAILURES: "5",
  });

  assert.deepEqual(reglages.plafonds, { turns: 40, durationMs: 20 * 60_000, tokens: 500_000, idleMs: 150_000 });
  assert.equal(reglages.seuilDisjoncteur, 5);
});

test("une variable vide vaut une variable absente", () => {
  assert.equal(lireReglages({ BRIGADE_MAX_TURNS: "" }).plafonds.turns, 100);
});

for (const [variable, valeur] of [
  ["BRIGADE_MAX_TURNS", "0"],
  ["BRIGADE_MAX_TURNS", "12.5"],
  ["BRIGADE_MAX_TURNS", "cent"],
  ["BRIGADE_MAX_MINUTES", "-1"],
  ["BRIGADE_MAX_MINUTES", "Infinity"],
  ["BRIGADE_MAX_MINUTES", "99999999"],
  ["BRIGADE_MAX_TOKENS", "2M"],
  ["BRIGADE_IDLE_MINUTES", "0"],
  ["BRIGADE_BREAKER_FAILURES", "0"],
] as const) {
  test(`${variable}=${valeur} est refusé, en nommant la variable : un garde-fou ne se désarme pas par une faute de frappe`, () => {
    assert.throws(
      () => lireReglages({ [variable]: valeur }),
      (erreur: unknown) => erreur instanceof ConfigInvalide && erreur.message.includes(variable),
    );
  });
}
