// #4230, criterion 3: in a test project, an action of a kind ranked 'chef' is parked at the pass. The parked item for
// the chef shows what the action will do. The action does not run.
import assert from "node:assert/strict";
import { test } from "node:test";
import { enregistrementDe } from "../../src/autonomie/agents/gestes.ts";
import { gestesEnAttente } from "../../src/autonomie/agents/porte.ts";
import { cuisine } from "./aide.ts";

test("a green delivery of a kind ranked 'chef' is parked for the chef with what it will do, and is not merged — the pass on act, its default", async (t) => {
  const { repertoire, faux, avertissements, ticket, tours } = cuisine(t);
  ticket(1, "publish");
  await tours(3);
  assert.equal(faux.cuissons.length, 1);
  // The action did not run: the PR is not merged, the ticket not served.
  assert.equal(faux.mergee(1), undefined);
  assert.equal(faux.ticket(1).state, "open");
  // Parked as a delivery the chef answers: never said refused by GitHub, and not retried as such.
  assert.deepEqual(avertissements, []);
  const attentes = gestesEnAttente(repertoire);
  assert.equal(attentes.length, 1);
  assert.equal(attentes[0]?.agent, "pass");
  assert.match(attentes[0]?.line ?? "", /^merge PR #\d+ of #1, which will publish: ticket 1$/);
  assert.equal(attentes[0]?.reason, "its kind of action is ranked 'chef' in the project's risk ranking: publish");
  assert.equal(attentes[0]?.approved, false);
  assert.deepEqual(enregistrementDe(repertoire, "pass").gestures, []);
});

test("a station with no gate does not merge a delivery ranked 'chef', and says it has nowhere to park it", async (t) => {
  const { repertoire, faux, avertissements, ticket, tours } = cuisine(t, { sansPorte: true });
  ticket(1, "pay");
  await tours(3);
  assert.equal(faux.mergee(1), undefined);
  assert.equal(faux.ticket(1).state, "open");
  assert.deepEqual(gestesEnAttente(repertoire), []);
  // Said once per head, as held: never as a merge GitHub refused.
  assert.ok(avertissements.length > 0);
  assert.ok(avertissements.every((texte) => /#1 on A — its merge waits for the chef \(its kind of action is ranked 'chef' in the project's risk ranking: pay\), but this station has no gate to park it/.test(texte)), avertissements.join("\n"));
});
