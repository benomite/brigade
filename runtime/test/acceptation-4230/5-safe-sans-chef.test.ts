// #4230, criterion 5: in a test project, an action of a kind ranked 'safe' (for example fix a typo) runs with no item
// for the chef. Next to it, an action ranked 'chef' in the same kitchen is parked: the ranking, not the kitchen, decides.
import assert from "node:assert/strict";
import { test } from "node:test";
import { enregistrementDe } from "../../src/autonomie/agents/gestes.ts";
import { gestesEnAttente } from "../../src/autonomie/agents/porte.ts";
import { cuisine } from "./aide.ts";

test("a green delivery that fixes a typo — ranked 'safe' by default — is merged with nothing parked for the chef", async (t) => {
  const { repertoire, faux, avertissements, ticket, tours } = cuisine(t);
  ticket(1, "fix-typo");
  ticket(2, "publish");
  await tours(6);
  assert.notEqual(faux.mergee(1), undefined);
  assert.equal(faux.ticket(1).state, "closed");
  assert.match(enregistrementDe(repertoire, "pass").gestures.map(({ line }) => line).join("\n"), /^merged PR #\d+ of #1$/);
  // Nothing parked for #1: the one item for the chef is #2's.
  assert.deepEqual(gestesEnAttente(repertoire).map(({ line }) => line.replace(/PR #\d+/, "PR")), ["merge PR of #2, which will publish: ticket 2"]);
  assert.equal(faux.mergee(2), undefined);
  assert.deepEqual(avertissements, []);
});

test("a station with no gate merges a delivery ranked 'safe' at once, and not one ranked 'chef'", async (t) => {
  const { repertoire, faux, avertissements, ticket, tours } = cuisine(t, { sansPorte: true });
  ticket(1, "fix-typo");
  ticket(2, "pay");
  await tours(6);
  assert.notEqual(faux.mergee(1), undefined);
  assert.equal(faux.ticket(1).state, "closed");
  assert.equal(faux.mergee(2), undefined);
  assert.deepEqual(gestesEnAttente(repertoire), []);
  assert.ok(avertissements.every((texte) => /^brigade : #2 on A — its merge waits for the chef/.test(texte)), avertissements.join("\n"));
});
