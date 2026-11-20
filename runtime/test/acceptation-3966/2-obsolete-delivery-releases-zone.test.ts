// #3966, critère 2 : un ticket dont la livraison est obsolète (réécrit, découpé ou mis de côté) libère sa zone dans le même geste.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { ReprendreLeTicket } from "../../src/reprise-du-manager.ts";
import { FauxGitHub } from "../faux-github.ts";

const TICKET = 3911;
const ZONE = "runtime/src/rail.ts";
type Reprise = Extract<Awaited<ReturnType<ReprendreLeTicket>>, { reprise: unknown }>["reprise"];

test("a rewrite closes the open PR of the rewritten ticket in the same gesture, so its zone is released", async () => {
  const faux = new FauxGitHub();
  faux.corpsEcrivables = true;
  faux.feu(TICKET, ["fire", "model:sonnet", "effort:medium"], "## Context\n\nOld body.\n\n## Acceptance criteria\n\n- done");
  const pr = faux.prOuverte([ZONE], `cook/${TICKET}-abcdef01`);
  pr.issue = TICKET;
  const reprise: Reprise = { choix: "reecrire", motif: "The ticket was badly posed.", corps: "## Context\n\nNew body.\n\n## Acceptance criteria\n\n- done" };
  let consultations = 0;
  const a = faux.station("A", {
    cuisiner: async () => ({ echec: "failed" }),
    avertir: () => {},
    reprendre: async () => {
      consultations += 1;
      return { reprise };
    },
  });
  for (let tour = 0; tour < 8 && consultations === 0; tour += 1) {
    await a.tour();
    await a.calme();
  }
  assert.equal(consultations, 1);
  assert.equal(faux.pr(pr.number).state, "closed", "the rewritten ticket's obsolete delivery is closed with the rewrite");
});
