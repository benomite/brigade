// The median against the max in `status`, and the ticket over twice the max in TODO's informative part.
import assert from "node:assert/strict";
import { test } from "node:test";
import { decrireAttentes } from "../../../src/attend.ts";
import { ligneMedianeContreMax, lignesDeTicketsTropLongs } from "../../../src/temps-max/affichage/affichage.ts";
import type { TempsTicket } from "../../../src/temps-ticket/ligne-status.ts";

const m = (n: number) => n * 60;
// Without dates, the duration is the sum of the phases.
const t = (ticket: number, cuisson: number, revue = 0, ci = 0): TempsTicket => ({ ticket, cuisson: m(cuisson), cuissonTests: 0, attentePasse: 0, revue: m(revue), ci: m(ci), merge: 0 });

test("status line: median over the max is red", () => {
  const ligne = ligneMedianeContreMax([t(1, 18), t(2, 18), t(3, 18)], 10, true);
  assert.equal(ligne, "\u001b[31m18 min / 10 min\u001b[0m");
});

test("status line: median at or under the max is not red", () => {
  assert.equal(ligneMedianeContreMax([t(1, 9), t(2, 10), t(3, 10)], 10, true), "10 min / 10 min");
  assert.equal(ligneMedianeContreMax([t(1, 5)], 10, true), "5 min / 10 min");
});

test("status line: no measured ticket, no line; the max is the project's", () => {
  assert.equal(ligneMedianeContreMax([], 10, true), null);
  assert.equal(ligneMedianeContreMax([t(1, 18)], 30, true), "18 min / 30 min");
});

test("TODO: a ticket over twice the max is named with its slowest phase", () => {
  assert.deepEqual(lignesDeTicketsTropLongs([t(7, 8, 14, 2)], 10), ["ticket #7 took 24 min, over twice the max of 10 min — slowest phase: review 14 min"]);
});

test("TODO: just under twice the max, or exactly twice, says nothing, even with the median over the max", () => {
  assert.deepEqual(lignesDeTicketsTropLongs([t(1, 19), t(2, 15, 5), t(3, 18)], 10), []);
});

test("TODO: the line sits in the informative part of the awaiting block and counts for no decision", () => {
  const bloc = decrireAttentes([], () => "1 min", null, null, null, lignesDeTicketsTropLongs([t(7, 25)], 10));
  assert.match(bloc.join("\n"), /nothing awaits the chef\n  ticket #7 took 25 min, over twice the max of 10 min — slowest phase: cooking 25 min\n/);
});
