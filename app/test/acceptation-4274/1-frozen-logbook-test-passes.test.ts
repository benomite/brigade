// Test d'acceptation (#4274). Critère 1 : le test gelé du journal du jour passe — le tri des fils en livré, cassé, réparé seul, non réparé, erreurs.
import assert from "node:assert/strict";
import { test } from "node:test";
import { logDuDay } from "../../src/projects/log-du-day.ts";

const MAINTENANT = new Date("2026-11-25T15:00:00.000Z");
const action = (at: string, line: string, kind: string, outcome: string) => ({ at, line, reason: "r", outcome, kind });

test("the logbook of the day sorts the threads into its groups and leaves yesterday out", () => {
  const log = logDuDay(
    {
      cook: [action("2026-11-25T09:00:00.000Z", "merged #4001 delivered", "delivered", "fixed by itself")],
      supervisor: [
        action("2026-11-25T10:00:00.000Z", "main went red", "broke", "not done"),
        action("2026-11-25T10:05:00.000Z", "reran main, now green", "fixed", "fixed by itself"),
        action("2026-11-25T11:00:00.000Z", "zone cycle stuck", "unfixed", "handed to the chef"),
        action("2026-11-25T12:00:00.000Z", "released a ticket by mistake", "mistake", "fixed by itself"),
        action("2026-11-24T12:00:00.000Z", "yesterday only line", "broke", "not done"),
      ],
    },
    MAINTENANT,
  );
  const texte = (section: unknown) => JSON.stringify(section);
  assert.ok(texte(log.delivered).includes("merged #4001 delivered"));
  assert.ok(texte(log.broke).includes("main went red"));
  assert.ok(texte(log.fixedBySelf).includes("reran main, now green"));
  assert.ok(texte(log.notFixed).includes("zone cycle stuck"));
  assert.ok(texte(log.mistakes).includes("released a ticket by mistake"));
  assert.ok(!JSON.stringify(log).includes("yesterday only line"));
});
