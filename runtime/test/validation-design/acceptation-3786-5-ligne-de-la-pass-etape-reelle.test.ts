// #3786 : la ligne de la carte, dans la pass, dit l'étape réelle et son âge : « review running since <time> » tant qu'une relecture tourne, « review failed at <time> » après un échec.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { faits, lireEtat } from "../../src/etat.ts";
import type { Fait } from "../../src/evenements.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { ouvrirRail } from "../aides/rail-du-journal.ts";
import { horloge, JOUR_HORLOGE, repertoireTemporaire } from "../outils.ts";

const LIMITES = { durationMs: 3_600_000, tokens: 2_000_000, idleMs: 600_000 };

export function enRelecture(t: TestContext) {
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
  const ligne = () => {
    const a = new Date(`${JOUR_HORLOGE}T10:10:00.000Z`);
    return faits(lireEtat(journal, a), a);
  };
  return { noter, ligne, activite: () => ligne().rail.find((surLeRail) => surLeRail.ticket === 14)?.activite };
}

test("the card line says 'review running since <time>' while a review runs", (t) => {
  const { activite } = enRelecture(t);
  assert.match(activite()?.faitEn ?? "", /^review running since \S+/);
});

test("the card line says 'review failed at <time>' once the review launch failed", (t) => {
  const { noter, activite } = enRelecture(t);
  noter({ type: "cook.exited", payload: { run: "review-14-x", outcome: "failed", code: null, signal: null, turns: 0, tokens: 0, durationMs: 1, error: "spawn E2BIG" } });
  assert.match(activite()?.faitEn ?? "", /^review failed at \S+/);
});
