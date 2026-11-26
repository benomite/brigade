// #3932, critère 2 : si le ticket découpé n'a aucune livraison ouverte, le découpage s'achève normalement, sans erreur.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { ReprendreLeTicket } from "../../src/reprise-du-manager.ts";
import { MARQUE_DE_LA_REPRISE } from "../../src/reprise-du-manager.ts";
import { FauxGitHub } from "../faux-github.ts";

const TICKET = 831;
const CORPS = "## Context\n\nTwo deliverables in one ticket.\n\n## Acceptance criteria\n\n- the rail loads in under a second";
type Reprise = Extract<Awaited<ReturnType<ReprendreLeTicket>>, { reprise: unknown }>["reprise"];

test("a split of a ticket with no open PR completes normally, without error", async () => {
  const faux = new FauxGitHub();
  faux.corpsEcrivables = true;
  faux.feu(TICKET, ["fire", "model:sonnet", "effort:medium"], CORPS);
  const tickets = [1, 2].map((n) => ({ titre: `Part ${n}`, corps: `## Acceptance criteria\n\n- part ${n} is done` }));
  const reprise: Reprise = { choix: "decouper", motif: "Two deliverables in one ticket.", tickets };
  const avertis: string[] = [];
  let consultations = 0;
  const a = faux.station("A", {
    cuisiner: async () => ({ echec: "failed" }),
    avertir: (texte: string) => void avertis.push(texte),
    reprendre: async () => {
      consultations += 1;
      return { reprise };
    },
  });
  for (let tour = 0; tour < 8 && consultations === 0; tour += 1) {
    await a.tour();
    await a.calme();
  }
  assert.equal(faux.creations.length, 2);
  assert.equal(faux.prs.length, 0);
  assert.equal(faux.ticket(TICKET).labels.has("set-aside:failures"), false, "not sent to the chef");
  const reprises = (faux.commentaires.get(TICKET) ?? []).filter((c) => c.body.startsWith(MARQUE_DE_LA_REPRISE));
  assert.equal(reprises.length, 1, "the split is announced as usual");
  assert.deepEqual(avertis.filter((texte) => texte.includes("could not be applied")), []);
});
