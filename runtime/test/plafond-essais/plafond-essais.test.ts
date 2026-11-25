import assert from "node:assert/strict";
import { test } from "node:test";
import { PLAFOND_ESSAIS, corpsDuPlafond, creerPlafondEssais } from "../../src/plafond-essais/index.ts";

const monter = (plafond: number) => {
  const arrets: number[] = [];
  const commentaires: string[] = [];
  const p = creerPlafondEssais({ plafond, arreter: async (n) => void arrets.push(n), commenter: async (_n, c) => void commentaires.push(c) });
  return { p, arrets, commentaires };
};

test("the default cap is the named constant", async () => {
  const arrets: number[] = [];
  const p = creerPlafondEssais({ arreter: async (n) => void arrets.push(n), commenter: async () => {} });
  for (let i = 0; i < PLAFOND_ESSAIS - 1; i++) await p.enregistrerEssai(1, { echec: "x" });
  assert.deepEqual(arrets, []);
  await p.enregistrerEssai(1, { echec: "x" });
  assert.deepEqual(arrets, [1]);
});

test("a try marked as load stays out of the count", async () => {
  const { p, arrets } = monter(2);
  await p.enregistrerEssai(1, { echec: "a", charge: true });
  await p.enregistrerEssai(1, { echec: "b", charge: true });
  assert.equal(p.total(1), 0);
  await p.enregistrerEssai(1, { echec: "c" });
  assert.equal(p.total(1), 1);
  assert.deepEqual(arrets, []);
});

test("a total read from the issue is kept, and the next try reaches the cap", async () => {
  const { p, arrets, commentaires } = monter(5);
  p.amorcer(9, 4);
  assert.equal(p.peutLancer(9), true);
  await p.enregistrerEssai(9, { echec: "last" });
  assert.deepEqual(arrets, [9]);
  assert.equal(commentaires.length, 1);
  p.amorcer(9, 1);
  assert.equal(p.total(9), 5);
});

test("a try past the cap still stops the ticket", async () => {
  const { p, arrets } = monter(3);
  p.amorcer(2, 7);
  await p.enregistrerEssai(2, { echec: "late" });
  assert.deepEqual(arrets, [2]);
  assert.equal(p.peutLancer(2), false);
});

test("the comment says the cap, the count and the last failure, in English", () => {
  const corps = corpsDuPlafond(12, 12, "red CI");
  assert.match(corps, /hard cap of 12 tries/);
  assert.match(corps, /\(12 tries so far\)/);
  assert.match(corps, /Last failure: red CI$/);
});

test("the stop comment gives the count of tries, not a shifted one", async () => {
  const { p, commentaires } = monter(3);
  for (let i = 0; i < 3; i++) await p.enregistrerEssai(1, { echec: "boom" });
  assert.equal(commentaires.length, 1);
  assert.match(commentaires[0], /cap of 3 tries/);
  assert.match(commentaires[0], /\(3 tries so far\)/);
});
