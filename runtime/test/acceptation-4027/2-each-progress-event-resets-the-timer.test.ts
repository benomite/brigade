// #4027, critère 2 : chacun des quatre événements de progrès remet la minuterie de 30 minutes à zéro.
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

for (const kind of ["commit", "ci", "review", "label"]) {
  test(`a ${kind} event by an agent resets the 30-minute timer`, async () => {
    const { inactivite, reveils, avancer, at } = monter();
    inactivite.progres(7, { kind: "commit", by: "agent", at: at(0) });
    avancer(20);
    inactivite.progres(7, { kind, by: "agent", at: at(20) });
    avancer(20);
    await inactivite.passer([{ number: 7, state: "cooking" }]);
    assert.equal(reveils.length, 0, `40 minutes after the start but 20 after the ${kind}: no wake`);
    avancer(10);
    await inactivite.passer([{ number: 7, state: "cooking" }]);
    assert.equal(reveils.length, 1, `30 minutes after the ${kind}: wake`);
  });
}
