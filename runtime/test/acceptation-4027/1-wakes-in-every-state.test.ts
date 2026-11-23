// #4027, critère 1 : le superviseur se réveille sur un ticket sans progrès depuis 30 minutes, dans chaque état.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ouvrirInactivite } from "../../src/inactivite/inactivite.ts";

const MIN = 60_000;
const T0 = Date.parse("2026-11-23T10:00:00Z");
function monter() {
  let now = T0;
  const reveils: { ticket: number; state: string }[] = [];
  const commentaires: { ticket: number; corps: string }[] = [];
  const inactivite = ouvrirInactivite({
    maintenant: () => new Date(now),
    reveiller: (r: { ticket: number; state: string }) => void reveils.push(r),
    github: { commenter: async (ticket: number, corps: string) => void commentaires.push({ ticket, corps }) },
  });
  return { inactivite, reveils, commentaires, avancer: (min: number) => void (now += min * MIN), at: (min: number) => new Date(T0 + min * MIN).toISOString() };
}

for (const state of ["cooking", "in pass", "set aside", "parked", "WAITING"]) {
  test(`the supervisor wakes on a ${state} ticket with no progress for 30 minutes, and not before`, async () => {
    const { inactivite, reveils, avancer } = monter();
    inactivite.progres(7, { kind: "commit", by: "agent", at: new Date(T0).toISOString() });
    avancer(29);
    await inactivite.passer([{ number: 7, state }]);
    assert.equal(reveils.length, 0, "no wake at 29 minutes");
    avancer(1);
    await inactivite.passer([{ number: 7, state }]);
    assert.deepEqual(reveils.map((r) => r.ticket), [7]);
    assert.equal(reveils[0].state, state);
  });
}
