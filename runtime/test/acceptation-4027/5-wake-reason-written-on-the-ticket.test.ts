// #4027, critère 5 : la raison du réveil est écrite sur le ticket, avec la date du dernier progrès.
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

test("the wake reason is written on the ticket with the date of the last progress", async () => {
  const { inactivite, commentaires, avancer, at } = monter();
  inactivite.progres(7, { kind: "review", by: "agent", at: at(0) });
  avancer(31);
  await inactivite.passer([{ number: 7, state: "WAITING" }]);
  assert.equal(commentaires.length, 1);
  assert.equal(commentaires[0].ticket, 7);
  assert.match(commentaires[0].corps, /30 minutes/);
  assert.ok(commentaires[0].corps.includes("2026-11-23T10:00:00"), `the date of the last progress is in: ${commentaires[0].corps}`);
});
