// Once the limit is reached the ticket is parked for the chef (#4226, it went to the supervisor before), never to a cook again (#3961).
import assert from "node:assert/strict";
import { test } from "node:test";
import { CHEF_TODO } from "../../src/github-seul/carte-todo/carte-todo.ts";
import { LABEL_IN_PASS } from "../../src/github-etat/etats.ts";
import { FauxGitHub } from "../faux-github.ts";

test("once the limit is reached, the ticket is parked for the chef and no cook is launched for it, even after a relaunch", async () => {
  const faux = new FauxGitHub();
  faux.feu(7);
  let jugements = 0;
  const options = { juger: async () => ({ verdict: "request-changes" as const, motif: `Problem number ${(jugements += 1)}.` }), avertir: () => {} };
  const a = faux.station("A", options);
  for (let tour = 0; tour < 15 && !faux.ticket(7).labels.has(CHEF_TODO); tour += 1) {
    await a.tour();
    await a.calme();
  }
  assert.ok(faux.ticket(7).labels.has(CHEF_TODO), `the ticket is parked for the chef: ${[...faux.ticket(7).labels].join(", ")}`);
  const cuissons = faux.cuissons.length;
  // The relaunch: a fresh station with nothing in memory, and a label removed after the last comment.
  const dernier = Date.parse((faux.commentaires.get(7) ?? []).at(-1)!.createdAt);
  faux.retraits.set(7, [...(faux.retraits.get(7) ?? []), { label: LABEL_IN_PASS, createdAt: new Date(dernier + 500).toISOString() }]);
  const b = faux.station("B", options);
  for (let tour = 0; tour < 6; tour += 1) {
    await b.tour();
    await b.calme();
  }
  assert.equal(faux.cuissons.length, cuissons, "no cook is launched for it again");
  assert.ok(faux.ticket(7).labels.has(CHEF_TODO), "it stays parked for the chef");
});
