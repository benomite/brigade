// #4230, criterion 4: after the chef answers on a parked action, the action runs.
import assert from "node:assert/strict";
import { test } from "node:test";
import { enregistrementDe, OUTCOME } from "../../src/autonomie/agents/gestes.ts";
import { approuverGeste, gestesEnAttente } from "../../src/autonomie/agents/porte.ts";
import { cuisine } from "./aide.ts";

test("the chef's answer on a parked merge, typed from its own process, merges it at the runtime's next tick, once, and the ticket is served", async (t) => {
  const { repertoire, porte, faux, avertissements, ticket, tours } = cuisine(t);
  ticket(1, "write-to-client");
  await tours(3);
  assert.equal(faux.mergee(1), undefined);
  const [attente] = gestesEnAttente(repertoire);
  assert.match(attente?.line ?? "", /which will write to a client: ticket 1$/);

  // `manager -- approve <id>`: the gesture is marked approved; nothing runs until the runtime's tick.
  approuverGeste(repertoire, attente?.id ?? 0);
  assert.equal(faux.mergee(1), undefined);
  await porte.relever();
  assert.notEqual(faux.mergee(1), undefined);
  assert.deepEqual(gestesEnAttente(repertoire), []);
  assert.deepEqual(enregistrementDe(repertoire, "pass").gestures.map(({ line, outcome }) => ({ line, outcome })), [{ line: attente?.line.replace(/^merge (PR #\d+ of #1).*$/, "merged $1"), outcome: OUTCOME.FIXED_BY_SELF }]);

  // The next turns serve it as any merged delivery, with no second answer asked and nothing merged twice.
  await tours(2);
  assert.equal(faux.ticket(1).state, "closed");
  assert.deepEqual(gestesEnAttente(repertoire), []);
  assert.equal(await porte.approuver(attente?.id ?? 0), null);
  assert.equal(enregistrementDe(repertoire, "pass").gestures.length, 1);
  assert.deepEqual(avertissements, []);
});
