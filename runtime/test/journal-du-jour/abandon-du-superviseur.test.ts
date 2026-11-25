// #4280 : une libération de zone que le superviseur remet au chef (#4243) est un abandon : elle notifie le chef, une
// fois ; celle qu'il fait seul ne notifie personne.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { GitHubDuTour } from "../../src/brigade-github.ts";
import type { GitHub } from "../../src/github.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import type { Runtime } from "../../src/runtime.ts";
import { brancherSuperviseur } from "../../src/superviseur/brancher.ts";
import { suivreLeTour } from "../../src/superviseur/tour.ts";
import { DELAI_PERIME_MS } from "../../src/superviseur/zone-liberee.ts";
import { jusqua, repertoireTemporaire } from "../outils.ts";

const MAINTENANT = new Date("2026-11-25T12:00:00.000Z");
const ancien = new Date(MAINTENANT.getTime() - DELAI_PERIME_MS - 60_000).toISOString();

test("a zone release handed to the chef notifies them once; the one the supervisor does by itself notifies nobody", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const journal = ouvrirJournal(repertoire);
  t.after(() => journal.fermer());
  const creees: Array<{ corps: string }> = [];
  const github = {
    labelliser: async () => undefined,
    delabelliser: async () => undefined,
    commenter: async () => undefined,
    creerIssue: async (c: { corps: string }) => (creees.push(c), 500 + creees.length),
    issuesDepuis: async () => creees.map((c, i) => ({ number: 501 + i, body: c.corps, association: "OWNER" })),
  } as unknown as GitHub;
  const tour = suivreLeTour(() => MAINTENANT);
  const lu = tour.envelopper({ fires: async () => [{ number: 10, title: "T10", labels: ["fire", "model:opus", "effort:medium"], state: "open" }] } as unknown as GitHubDuTour);
  let ecouter: (() => void) | null = null;
  const runtime = { projet: "shop", journal, repertoireEtat: repertoire, surReveil: (ecoute: () => void) => ((ecouter = ecoute), () => {}) } as unknown as Runtime;
  brancherSuperviseur(runtime, { tour, github, depot: "acme/shop", branche: "main", consulter: () => null, maintenant: () => MAINTENANT, dire: () => {}, repertoireEtat: repertoire });

  await lu.fires();
  tour.perimee(10, { number: 90, branche: "patch-1", misAJourLe: ancien });
  (ecouter as (() => void) | null)?.();
  await jusqua(() => journal.duType("chef.notified", 10).length > 0);
  await new Promise((resoudre) => setTimeout(resoudre, 50));

  const notifiees = journal.duType("chef.notified", 10);
  assert.equal(notifiees.length, 1, "the release by itself notifies nobody; the card handed to the chef notifies once");
  assert.match(notifiees[0]?.payload.line ?? "", /^Asked the chef on #501 whether to close the human's stale PR #90/);
});
