// #3953, critère 1 : trois rouges consécutifs du même check sur un ticket — le runtime refuse le push suivant et
// écrit un seul commentaire sur l'issue, qui nomme le check (et les trois runs).
import assert from "node:assert/strict";
import { test } from "node:test";
import { deciderDuPush } from "../../src/statuts-ci/regles.ts";

type R = { check: string; outcome: "red" | "green"; run: number };
const rouge = (check: string, run: number): R => ({ check, outcome: "red", run });
const statutsFixes = (parCible: Record<string, R[]>) => ({ resultats: async (cible: string) => parCible[cible] ?? [] });

test("three reds of the same check refuse the next push and write one comment naming the check", async () => {
  const commentaires: Array<{ issue: number; corps: string }> = [];
  const statuts = statutsFixes({ "ticket:42": [rouge("unit", 303), rouge("unit", 302), rouge("unit", 301)] });
  const decision = await deciderDuPush({ statuts, ticket: 42, commenter: async (issue, corps) => void commentaires.push({ issue, corps }) });
  assert.equal(decision.pousser, false);
  assert.equal(commentaires.length, 1);
  const [premier] = commentaires;
  assert.ok(premier);
  assert.equal(premier.issue, 42);
  assert.match(premier.corps, /unit/);
  for (const run of [301, 302, 303]) assert.match(premier.corps, new RegExp(String(run)));
});
