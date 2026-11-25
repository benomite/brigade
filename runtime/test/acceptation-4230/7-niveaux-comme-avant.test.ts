// #4230, criterion 7: the observe / propose / act levels behave as before. A ticket that says no kind of action goes
// through the pass's level alone; a kind ranked 'safe' leaves the level alone too; `observe` never runs an action,
// whatever its rank. The existing tests of the levels (`test/autonomie/agents/`) still pass.
import assert from "node:assert/strict";
import { test } from "node:test";
import { enregistrementDe, OUTCOME } from "../../src/autonomie/agents/gestes.ts";
import { gestesEnAttente } from "../../src/autonomie/agents/porte.ts";
import { cuisine } from "./aide.ts";

// brigade:guard
test("with no kind of action, the pass on propose holds the merge as before, on act merges it, on observe never", async (t) => {
  const propose = cuisine(t, { pass: "propose" });
  propose.ticket(1);
  await propose.tours(3);
  assert.equal(propose.faux.mergee(1), undefined);
  assert.deepEqual(gestesEnAttente(propose.repertoire).map(({ line, reason }) => ({ line: line.replace(/PR #\d+/, "PR"), reason: reason.replace(/`[0-9a-f]{7}`/, "`sha`") })), [{ line: "merge PR of #1", reason: "its delivery is green on `sha`" }]);

  const agit = cuisine(t);
  agit.ticket(1);
  await agit.tours(3);
  assert.notEqual(agit.faux.mergee(1), undefined);
  assert.deepEqual(gestesEnAttente(agit.repertoire), []);

  const observe = cuisine(t, { pass: "observe" });
  observe.ticket(1);
  await observe.tours(3);
  assert.equal(observe.faux.mergee(1), undefined);
  assert.deepEqual(enregistrementDe(observe.repertoire, "pass").gestures.map(({ outcome }) => outcome), [OUTCOME.NOT_DONE]);
});

// brigade:guard
test("a kind ranked 'safe' keeps the pass's level: on propose its merge still waits for the chef's OK", async (t) => {
  const { repertoire, faux, ticket, tours } = cuisine(t, { pass: "propose" });
  ticket(1, "fix-typo");
  await tours(3);
  assert.equal(faux.mergee(1), undefined);
  assert.equal(gestesEnAttente(repertoire).length, 1);
});

// brigade:guard
test("a kind ranked 'chef' on observe is only logged as not done, never parked nor run", async (t) => {
  const { repertoire, faux, ticket, tours } = cuisine(t, { pass: "observe" });
  ticket(1, "publish");
  await tours(3);
  assert.equal(faux.mergee(1), undefined);
  assert.deepEqual(gestesEnAttente(repertoire), []);
  assert.deepEqual(enregistrementDe(repertoire, "pass").gestures.map(({ outcome }) => outcome), [OUTCOME.NOT_DONE]);
});
