// #3932, critère 1 : quand le manager découpe un ticket (choix=decouper), la livraison (PR) ouverte du ticket découpé
// est fermée dans la même opération, avec un commentaire sur cette PR qui nomme chaque sous-ticket créé.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { ReprendreLeTicket } from "../../src/reprise-du-manager.ts";
import { FauxGitHub } from "../faux-github.ts";

const TICKET = 831;
const CORPS = "## Context\n\nTwo deliverables in one ticket.\n\n## Acceptance criteria\n\n- the rail loads in under a second";
type Reprise = Extract<Awaited<ReturnType<ReprendreLeTicket>>, { reprise: unknown }>["reprise"];

test("a split closes the open PR of the split ticket, commenting every sub-ticket created", async () => {
  const faux = new FauxGitHub();
  faux.corpsEcrivables = true;
  faux.feu(TICKET, ["fire", "model:sonnet", "effort:medium"], CORPS);
  const pr = faux.prOuverte(["runtime/src/rail.ts"], `cook/${TICKET}-abcdef01`);
  pr.issue = TICKET;
  const tickets = [1, 2, 3].map((n) => ({ titre: `Part ${n}`, corps: `## Acceptance criteria\n\n- part ${n} is done` }));
  const reprise: Reprise = { choix: "decouper", motif: "Two deliverables in one ticket.", tickets };
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
  const nes = faux.creations;
  assert.equal(nes.length, 3);
  assert.equal(faux.pr(pr.number).state, "closed", "the split ticket's delivery is closed with the split");
  const dits = (faux.commentaires.get(pr.number) ?? []).map((c) => c.body).join("\n");
  assert.ok(dits.includes(nes.map((n) => `#${n}`).join(", ")), `the PR's comment names every sub-ticket: ${dits}`);
});
