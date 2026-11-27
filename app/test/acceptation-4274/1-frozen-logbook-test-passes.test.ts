// Test d'acceptation (#4274). Critère 1 : le test gelé du journal du jour passe — le tri des fils en livré, cassé, réparé seul, non réparé, erreurs.
import assert from "node:assert/strict";
import { test } from "node:test";
import { journalDuJour } from "../../src/projets/journal-du-jour.ts";

const MAINTENANT = new Date("2026-11-25T15:00:00.000Z");
const geste = (at: string, line: string, kind: string, outcome: string) => ({ at, line, reason: "r", outcome, kind });

test("the logbook of the day sorts the threads into its groups and leaves yesterday out", () => {
  const journal = journalDuJour(
    {
      cook: [geste("2026-11-25T09:00:00.000Z", "merged #4001 delivered", "delivered", "fixed by itself")],
      supervisor: [
        geste("2026-11-25T10:00:00.000Z", "main went red", "broke", "not done"),
        geste("2026-11-25T10:05:00.000Z", "reran main, now green", "fixed", "fixed by itself"),
        geste("2026-11-25T11:00:00.000Z", "zone cycle stuck", "unfixed", "handed to the chef"),
        geste("2026-11-25T12:00:00.000Z", "released a ticket by mistake", "mistake", "fixed by itself"),
        geste("2026-11-24T12:00:00.000Z", "yesterday only line", "broke", "not done"),
      ],
    },
    MAINTENANT,
  );
  const texte = (section: unknown) => JSON.stringify(section);
  assert.ok(texte(journal.delivered).includes("merged #4001 delivered"));
  assert.ok(texte(journal.broke).includes("main went red"));
  assert.ok(texte(journal.fixedBySelf).includes("reran main, now green"));
  assert.ok(texte(journal.notFixed).includes("zone cycle stuck"));
  assert.ok(texte(journal.mistakes).includes("released a ticket by mistake"));
  assert.ok(!JSON.stringify(journal).includes("yesterday only line"));
});
