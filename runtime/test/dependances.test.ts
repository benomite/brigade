import assert from "node:assert/strict";
import { test } from "node:test";
import { cycles, direCycle } from "../src/dependances.ts";

const graphe = (aretes: Record<number, number[]>) => new Map(Object.entries(aretes).map(([ticket, attendus]) => [Number(ticket), attendus]));

test("sans cycle, rien : une chaîne d'attentes n'en est pas un", () => {
  assert.deepEqual(cycles(graphe({ 1: [2], 2: [3], 3: [] })), new Map());
});

test("deux tickets qui s'attendent l'un l'autre : chacun porte le même cycle", () => {
  assert.deepEqual(cycles(graphe({ 14: [15], 15: [14] })), new Map([[14, [14, 15]], [15, [14, 15]]]));
});

test("un cycle long est nommé en entier, dans l'ordre des attentes, depuis son plus petit numéro", () => {
  const trouves = cycles(graphe({ 30: [10], 10: [20], 20: [30], 40: [10] }));

  assert.deepEqual(trouves, new Map([[30, [10, 20, 30]], [10, [10, 20, 30]], [20, [10, 20, 30]]]));
});

test("un ticket qui attend un ticket d'un cycle n'est pas dans le cycle", () => {
  assert.equal(cycles(graphe({ 1: [2], 2: [1], 3: [1] })).has(3), false);
});

test("un ticket qui s'attend lui-même n'est pas un cycle : sa fiche le dit déjà", () => {
  assert.deepEqual(cycles(graphe({ 1: [1] })), new Map());
});

test("un cycle qui passe par un ticket hors du graphe ne se voit pas", () => {
  assert.deepEqual(cycles(graphe({ 1: [2], 3: [1] })), new Map());
});

test("un ticket pris dans deux cycles porte le plus court", () => {
  assert.deepEqual(cycles(graphe({ 1: [2, 3], 2: [1], 3: [4], 4: [1] })).get(1), [1, 2]);
});

test("le cycle se dit avec tous ses tickets, et ce qu'il faut faire", () => {
  assert.equal(
    direCycle([10, 20, 30]),
    "attend : cycle de dépendances — #10 → #20 → #30 → #10 (chacun attend le suivant) : aucun ne partirait jamais, retirer une de ces attentes",
  );
});
