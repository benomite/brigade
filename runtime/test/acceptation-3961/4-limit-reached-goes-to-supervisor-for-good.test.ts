// Once the limit is reached the ticket goes to the supervisor, never to a cook again (#3961).
import assert from "node:assert/strict";
import { test } from "node:test";
import { estMisDeCote } from "../../src/github.ts";
import { LABEL_IN_PASS } from "../../src/github-etat/etats.ts";
import { FauxGitHub } from "../faux-github.ts";

test("once the limit is reached, the ticket goes to the supervisor and no cook is launched for it, even after a relaunch", async () => {
  const faux = new FauxGitHub();
  faux.feu(7);
  let jugements = 0;
  const options = { juger: async () => ({ verdict: "request-changes" as const, motif: `Problem number ${(jugements += 1)}.` }), avertir: () => {} };
  const a = faux.station("A", options);
  for (let tour = 0; tour < 15 && !estMisDeCote([...faux.ticket(7).labels]); tour += 1) {
    await a.tour();
    await a.calme();
  }
  assert.ok(estMisDeCote([...faux.ticket(7).labels]), `the ticket went to the supervisor: ${[...faux.ticket(7).labels].join(", ")}`);
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
  assert.ok(estMisDeCote([...faux.ticket(7).labels]), "it stays with the supervisor");
});
