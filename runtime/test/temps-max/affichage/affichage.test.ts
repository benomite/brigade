// The median lost time against the threshold in `status`, and the ticket that lost over twice the threshold in TODO's informative part (#2670).
import assert from "node:assert/strict";
import { test } from "node:test";
import { decrireAttentes } from "../../../src/attend.ts";
import { ligneDuTempsPerdu, lignesDeTicketsQuiPerdent } from "../../../src/temps-max/affichage/affichage.ts";
import type { TempsTicket } from "../../../src/temps-ticket/ligne-status.ts";

const m = (n: number) => n * 60;
// A ticket that cooked `cuisson` minutes and lost `attente` waiting for its claim and `ratees` in failed cooks.
const t = (ticket: number, cuisson: number, attente = 0, ratees = 0): TempsTicket => ({ ticket, attentePrise: m(attente), cuissonsRatees: m(ratees), cuisson: m(cuisson), cuissonTests: 0, attentePasse: 0, revue: 0, ci: 0, merge: 0 });

test("status line: a median lost time over the threshold is red", () => {
  assert.equal(ligneDuTempsPerdu([t(1, 5, 3), t(2, 5, 3.5), t(3, 5, 4)], 2, true), "\u001b[31m3.5 min / 2 min\u001b[0m");
});

test("status line: at or under the threshold is not red, however long the tickets cooked", () => {
  assert.equal(ligneDuTempsPerdu([t(1, 90, 1), t(2, 60, 2), t(3, 120, 2)], 2, true), "2 min / 2 min");
  assert.equal(ligneDuTempsPerdu([t(1, 90)], 2, true), "0 min / 2 min");
});

test("status line: no measured ticket, no line; the threshold is the project's", () => {
  assert.equal(ligneDuTempsPerdu([], 2, true), null);
  assert.equal(ligneDuTempsPerdu([t(1, 5, 3)], 5, true), "3 min / 5 min");
});

test("TODO: a ticket that lost over twice the threshold is named with its heaviest loss", () => {
  assert.deepEqual(lignesDeTicketsQuiPerdent([t(7, 8, 1, 4)], 2), ["ticket #7 lost 5 min, over twice the threshold of 2 min — mostly failed cooks 4 min"]);
});

test("TODO: losing exactly twice the threshold, or a long ticket that lost nothing, says nothing", () => {
  assert.deepEqual(lignesDeTicketsQuiPerdent([t(1, 90), t(2, 15, 4), t(3, 18, 1, 3)], 2), []);
});

test("TODO: the line sits in the informative part of the awaiting block and counts for no decision", () => {
  const bloc = decrireAttentes([], () => "1 min", null, null, null, lignesDeTicketsQuiPerdent([t(7, 25, 6)], 2));
  assert.match(bloc.join("\n"), /nothing awaits the chef\n  ticket #7 lost 6 min, over twice the threshold of 2 min — mostly waiting for a claim 6 min\n/);
});
