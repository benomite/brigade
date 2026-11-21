// #3786 : la carte lit le run du jugement du choix de design (`design-<n>-github`) : son lancement raté y est dit, avec l'erreur réelle.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { faits, lireEtat } from "../../src/etat.ts";
import type { Fait } from "../../src/evenements.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { ouvrirRail } from "../aides/rail-du-journal.ts";
import { horloge, JOUR_HORLOGE, repertoireTemporaire } from "../outils.ts";

const LIMITES = { durationMs: 3_600_000, tokens: 2_000_000, idleMs: 600_000 };

function enRelecture(t: TestContext) {
  const journal = ouvrirJournal(repertoireTemporaire(t), { maintenant: horloge() });
  t.after(() => journal.fermer());
  const noter = (fait: Fait, ticket: number | null = null, author = "runtime") => journal.ajouter({ project: "brigade", ticket, author, ...fait });
  noter({ type: "runtime.started", payload: { pid: 1, host: "box", node: "v26" } });
  noter({ type: "ticket.arrived", payload: { title: "Ticket 14", priority: 1, createdAt: "2026-10-01T00:00:14Z", url: "https://exemple.test/14" } }, 14, "github");
  const rail = ouvrirRail(journal, { projet: "brigade", dureeBailMs: 3_600_000, maintenant: () => new Date(`${JOUR_HORLOGE}T10:00:00.000Z`) });
  rail.prendre("box/claude");
  noter({ type: "cook.launched", payload: { run: "14-a", limits: LIMITES, stream: "runs/14-a.jsonl", station: "box/claude" } }, 14);
  noter({ type: "cook.reported", payload: { run: "14-a", ending: "done", reason: null, summary: null, branch: "cook/14-a", pr: null } }, 14);
  rail.envoyerEnPass(14, "box/claude");
  noter({ type: "pass.started", payload: { run: "14-a", pr: "https://exemple.test/pr/1", number: 1, sha: "abc" } }, 14);
  noter({ type: "cook.launched", payload: { run: "review-14-x", limits: LIMITES, stream: "runs/review-14-x.jsonl", station: "reviewer" } });
  noter({ type: "cook.exited", payload: { run: "review-14-x", outcome: "ok", code: 0, signal: null, turns: 3, tokens: 9, durationMs: 1 } });
  const ligne = () => {
    const a = new Date(`${JOUR_HORLOGE}T10:10:00.000Z`);
    return faits(lireEtat(journal, a), a);
  };
  const etat = () => lireEtat(journal, new Date(`${JOUR_HORLOGE}T10:10:00.000Z`));
  return { noter, ligne, etat, activite: () => ligne().rail.find((surLeRail) => surLeRail.ticket === 14)?.activite };
}

test("the card of a delivery says the design review cannot start, with the real error, once the design run fails", (t) => {
  const { noter, activite } = enRelecture(t);
  noter({ type: "cook.launched", payload: { run: "design-14-github", limits: LIMITES, stream: "runs/design-14-github.jsonl", station: "reviewer" } });
  noter({ type: "cook.exited", payload: { run: "design-14-github", outcome: "failed", code: null, signal: null, turns: 0, tokens: 0, durationMs: 1, error: "spawn E2BIG" } });
  assert.equal(activite()?.faitEn, "design review cannot start: spawn E2BIG");
});
