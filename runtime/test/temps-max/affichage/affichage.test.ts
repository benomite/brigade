// The median lost time against the threshold in `status`, and the ticket that lost over twice the threshold in TODO's informative part (#2670).
import assert from "node:assert/strict";
import { test } from "node:test";
import { decrireAttentes } from "../../../src/attend.ts";
import { lignesDeTicketsQuiPerdent } from "../../../src/temps-max/affichage/affichage.ts";
import type { TempsTicket } from "../../../src/temps-ticket/ligne-status.ts";

const m = (n: number) => n * 60;
// A ticket that cooked `cuisson` minutes and lost `attente` waiting for its claim and `ratees` in failed cooks.
const t = (ticket: number, cuisson: number, attente = 0, ratees = 0): TempsTicket => ({ ticket, attentePrise: m(attente), cuissonsRatees: m(ratees), cuisson: m(cuisson), cuissonTests: 0, attentePasse: 0, revue: 0, ci: 0, merge: 0 });

test("TODO: a ticket that lost over twice the threshold is named with its heaviest loss", () => {
  assert.deepEqual(lignesDeTicketsQuiPerdent([t(7, 8, 1, 4)], 2), ["ticket #7 lost 5 min, over twice the threshold of 2 min — mostly failed cooks 4 min"]);
});

test("TODO: losing exactly twice the threshold, or a long ticket that lost nothing, says nothing", () => {
  assert.deepEqual(lignesDeTicketsQuiPerdent([t(1, 90), t(2, 15, 4), t(3, 18, 1, 3)], 2), []);
});

test("TODO: the line sits in the informative part of the awaiting block and counts for no decision", () => {
  const bloc = decrireAttentes([], () => "1 min", null, null, lignesDeTicketsQuiPerdent([t(7, 25, 6)], 2));
  assert.match(bloc.join("\n"), /nothing awaits the chef\n  ticket #7 lost 6 min, over twice the threshold of 2 min — mostly waiting for a claim 6 min\n/);
});
