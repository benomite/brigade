// The send-back count is per ticket and survives a relaunch (#3961).
import assert from "node:assert/strict";
import { test } from "node:test";
import { HORS_CUISINE } from "../../src/github.ts";
import { FauxGitHub } from "../faux-github.ts";

// Each refusal: a send-back, or the parking that the third refusal of the ticket's life is (#4226).
const renvois = (faux: FauxGitHub) => (faux.commentaires.get(7) ?? []).filter(({ body }) => /^<!-- brigade:(renvoi n=|todo kind=blocked tries=)/.test(body));
const nDe = (body: string) => Number(/^<!-- brigade:(?:renvoi n=|todo kind=blocked tries=)(\d+)/.exec(body)?.[1]);

test("after 2 send-backs and a relaunch, the next send-back counts as 3, not 1", async () => {
  const faux = new FauxGitHub();
  faux.feu(7);
  let jugements = 0;
  // A different reason each time, on a different head each time.
  const a = faux.station("A", { juger: async () => ({ verdict: "request-changes", motif: `Problem number ${(jugements += 1)}.` }), avertir: () => {} });
  for (let tour = 0; tour < 10 && renvois(faux).length < 2; tour += 1) {
    await a.tour();
    await a.calme();
  }
  assert.equal(renvois(faux).length, 2, "two send-backs so far");
  // The relaunch: the label that sets a ticket aside is removed, just after the last send-back.
  const dernier = Date.parse(renvois(faux).at(-1)!.createdAt);
  faux.retraits.set(7, [...(faux.retraits.get(7) ?? []), { label: HORS_CUISINE, createdAt: new Date(dernier + 500).toISOString() }]);
  for (let tour = 0; tour < 10 && renvois(faux).length < 3; tour += 1) {
    await a.tour();
    await a.calme();
  }
  const comptes = renvois(faux).map(({ body }) => nDe(body));
  assert.deepEqual(comptes.slice(0, 3), [1, 2, 3], `the count is read per ticket, not per cook run: ${comptes.join(", ")}`);
});
