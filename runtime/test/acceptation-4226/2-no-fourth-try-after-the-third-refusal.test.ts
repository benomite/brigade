// #4226, critère 2 : un ticket n'a pas de quatrième essai — au troisième refus il est mis de côté, aucun cook ne part pour lui.
import assert from "node:assert/strict";
import { test } from "node:test";
import { FauxGitHub } from "../faux-github.ts";

const TICKET = 7;

test("after the third refusal the ticket is parked and no cook is started for it, tour after tour", async () => {
  const faux = new FauxGitHub();
  faux.feu(TICKET);
  let refus = 0;
  const a = faux.station("A", { juger: async () => ({ verdict: "request-changes", motif: `Problem number ${(refus += 1)}.` }), avertir: () => {} });
  for (let tour = 0; tour < 12 && refus < 3; tour += 1) {
    await a.tour();
    await a.calme();
  }
  assert.equal(refus, 3, "three refusals");
  const cooks = faux.cuissons.filter(({ issue }) => issue === TICKET).length;
  for (let tour = 0; tour < 6; tour += 1) {
    await a.tour();
    await a.calme();
  }
  assert.equal(faux.cuissons.filter(({ issue }) => issue === TICKET).length, cooks, "no cook after the third refusal");
  assert.equal(cooks, 3, "the ticket had three tries, not four");
  assert.equal(refus, 3, "nothing is reviewed again");
  const dits = (faux.commentaires.get(TICKET) ?? []).map(({ body }) => body).join("\n");
  assert.match(dits, /parked/i, "the ticket says it is parked for the chef");
});
