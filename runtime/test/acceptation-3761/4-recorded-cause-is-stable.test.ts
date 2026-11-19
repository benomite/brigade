// #3761, critère 4 : la cause qu'enregistre la cuisine retenue est stable : tant que le même ticket est sauté pour la
// même raison, elle ne passe jamais à « unknown » ; elle ne change que si la vraie raison change.
// Test d'acceptation gelé (#3725) : le suivi du tour GitHub seul rejoue plusieurs tours de la porte de prise, avec la lecture
// de la retenue entre la lecture des tickets et le saut, comme le fait chaque réveil du runtime.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { GitHubDuTour, TicketLu } from "../../src/brigade-github.ts";
import { direCause, diagnostiquer, direSaut, SANS_SIGNAL } from "../../src/retenue/retenue.ts";
import { suivreLeTour } from "../../src/retenue/tour.ts";

const TICKET = 3734;
const tickets: TicketLu[] = [{ number: TICKET, title: "Ticket", labels: ["fire", "model:opus", "effort:medium"], state: "open" }];
const client = { fires: async () => tickets, commentaires: async () => [] } as unknown as GitHubDuTour;

test("the same ticket skipped for the same reason records the same cause on every turn, never 'unknown'; a new reason changes it", async () => {
  const suivi = suivreLeTour(() => new Date("2026-11-17T10:00:00.000Z"));
  const github = suivi.envelopper(client);
  const cause = () => direCause(diagnostiquer({ ...SANS_SIGNAL, explications: suivi.vue().explications }).cause);
  const tour = async (raison: string) => {
    await github.fires();
    const entre = cause(); // un réveil du runtime entre la lecture des tickets et la porte de prise
    suivi.sauter(TICKET, direSaut(TICKET, raison));
    return { entre, apres: cause() };
  };

  const zone = await tour("zone held by #3700");
  assert.match(zone.apres, /zone held by #3700/);
  for (let i = 0; i < 4; i++) {
    const encore = await tour("zone held by #3700");
    assert.equal(encore.apres, zone.apres);
    assert.equal(encore.entre, zone.apres, "a reading between two turns says the same cause");
    assert.doesNotMatch(encore.entre + encore.apres, /unknown/);
  }
  const autre = await tour("its calibration (model, effort) is incomplete");
  assert.match(autre.apres, /calibration/);
  assert.notEqual(autre.apres, zone.apres);
});
