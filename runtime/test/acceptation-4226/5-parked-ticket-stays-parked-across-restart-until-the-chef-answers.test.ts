// #4226, critère 5 : un ticket mis de côté le reste après un redémarrage de la station, jusqu'à ce que le chef réponde sur le ticket.
import assert from "node:assert/strict";
import { test } from "node:test";
import { FauxGitHub } from "../faux-github.ts";

const TICKET = 7;

test("a parked ticket gets no cook after a station restart, and only the chef's answer on the ticket lets it go on", async () => {
  const faux = new FauxGitHub();
  faux.feu(TICKET);
  let refus = 0;
  const options = { juger: async () => ({ verdict: "request-changes" as const, motif: `Problem number ${(refus += 1)}.` }), avertir: () => {} };
  const a = faux.station("A", options);
  for (let tour = 0; tour < 12 && refus < 3; tour += 1) {
    await a.tour();
    await a.calme();
  }
  const cooks = () => faux.cuissons.filter(({ issue }) => issue === TICKET).length;
  const avant = cooks();
  assert.equal(avant, 3);
  // The restart: a station with nothing in memory, which reads only what was stored.
  const apres = faux.station("A-restarted", options);
  for (let tour = 0; tour < 6; tour += 1) {
    await apres.tour();
    await apres.calme();
  }
  assert.equal(cooks(), avant, "still parked after the restart");
  faux.poster(TICKET, "chef", "Go on: use the other approach.");
  for (let tour = 0; tour < 6 && cooks() === avant; tour += 1) {
    await apres.tour();
    await apres.calme();
  }
  assert.ok(cooks() > avant, "the chef answered on the ticket: a cook may start again");
});
