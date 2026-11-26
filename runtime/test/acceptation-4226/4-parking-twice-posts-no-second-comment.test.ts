// #4226, critère 4 : jouer deux fois l'étape de mise de côté ne poste aucun second commentaire.
import assert from "node:assert/strict";
import { test } from "node:test";
import { FauxGitHub } from "../faux-github.ts";

const TICKET = 7;

test("running the park step again, on the same station or a fresh one, posts no second comment", async () => {
  const faux = new FauxGitHub();
  faux.feu(TICKET);
  let refus = 0;
  const options = { juger: async () => ({ verdict: "request-changes" as const, motif: `Problem number ${(refus += 1)}.` }), avertir: () => {} };
  const a = faux.station("A", options);
  for (let tour = 0; tour < 12 && refus < 3; tour += 1) {
    await a.tour();
    await a.calme();
  }
  const parcs = () => (faux.commentaires.get(TICKET) ?? []).filter(({ body }) => /parked/i.test(body));
  assert.equal(parcs().length, 1, "one comment at the third refusal");
  for (let tour = 0; tour < 3; tour += 1) {
    await a.tour();
    await a.calme();
  }
  const b = faux.station("B", options);
  for (let tour = 0; tour < 3; tour += 1) {
    await b.tour();
    await b.calme();
  }
  assert.equal(parcs().length, 1, "still one comment after the step ran again");
});
