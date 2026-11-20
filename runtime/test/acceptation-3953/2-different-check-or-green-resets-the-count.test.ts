// #3953, critère 2 : si le troisième résultat est d'un autre check, ou si un vert s'intercale entre les rouges, le
// push part et rien n'est écrit sur l'issue.
import assert from "node:assert/strict";
import { test } from "node:test";
import { deciderDuPush } from "../../src/statuts-ci/regles.ts";

type R = { check: string; outcome: "red" | "green"; run: number };
const rouge = (check: string, run: number): R => ({ check, outcome: "red", run });
const vert = (check: string, run: number): R => ({ check, outcome: "green", run });
const statutsFixes = (parCible: Record<string, R[]>) => ({ resultats: async (cible: string) => parCible[cible] ?? [] });

async function decider(resultats: R[]) {
  const commentaires: string[] = [];
  const decision = await deciderDuPush({ statuts: statutsFixes({ "ticket:7": resultats }), ticket: 7, commenter: async (_issue, corps) => void commentaires.push(corps) });
  return { decision, commentaires };
}

test("a third result from a different check, or a green between the reds, lets the push go ahead", async () => {
  const autreCheck = await decider([rouge("unit", 13), rouge("unit", 12), rouge("lint", 11)]);
  assert.equal(autreCheck.decision.pousser, true);
  assert.deepEqual(autreCheck.commentaires, []);

  const vertAuMilieu = await decider([rouge("unit", 13), vert("unit", 12), rouge("unit", 11), rouge("unit", 10)]);
  assert.equal(vertAuMilieu.decision.pousser, true);
  assert.deepEqual(vertAuMilieu.commentaires, []);
});
