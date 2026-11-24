// #4027, critère 3 : un changement de label par un humain ou par la station ne remet pas la minuterie à zéro.
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

for (const by of ["human", "station"]) {
  test(`a label change by ${by} does not reset the timer`, async () => {
    const { inactivite, reveils, avancer, at } = monter();
    inactivite.progres(7, { kind: "commit", by: "agent", at: at(0) });
    avancer(20);
    inactivite.progres(7, { kind: "label", by, at: at(20) });
    avancer(10);
    await inactivite.passer([{ number: 7, state: "cooking" }]);
    assert.deepEqual(reveils.map((r) => r.ticket), [7], "30 minutes after the last real progress: wake");
  });
}
