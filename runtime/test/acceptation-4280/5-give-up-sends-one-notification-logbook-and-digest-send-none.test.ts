// #4280, critère 5 : un abandon envoie une notification ; fabriquer le journal ou le digest n'en envoie aucune.
import assert from "node:assert/strict";
import { test } from "node:test";
import { digestDeLaVeille } from "../../src/journal-du-jour/digest.ts";
import { notifierLesAbandons } from "../../src/journal-du-jour/notifications.ts";

const geste = (line: string, kind: string, outcome: string) => ({ at: "2026-11-24T10:00:00.000Z", line, reason: "r", outcome, kind });

test("one give-up sends one notification; building the digest sends none", () => {
  const envoyees: unknown[] = [];
  const notifier = (n: unknown) => envoyees.push(n);
  const fils = { supervisor: [geste("merged #4001", "delivered", "fixed by itself"), geste("main went red", "broke", "not done"), geste("zone cycle stuck, gave up", "unfixed", "handed to the chef")] };

  digestDeLaVeille({ postMortems: [], fils }, new Date("2026-11-25T07:00:00.000Z"));
  assert.equal(envoyees.length, 0, "the digest notifies nobody");

  notifierLesAbandons(fils.supervisor, notifier);
  assert.equal(envoyees.length, 1);
  assert.ok(JSON.stringify(envoyees[0]).includes("zone cycle stuck, gave up"));
});
