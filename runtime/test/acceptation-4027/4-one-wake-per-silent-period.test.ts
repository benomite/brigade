// #4027, critère 4 : un réveil par période de silence ; le suivant demande 30 nouvelles minutes sans progrès.
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

test("after a wake the supervisor does not wake again on every tick, only after a new 30 minutes without progress", async () => {
  const { inactivite, reveils, avancer, at } = monter();
  const tickets = [{ number: 7, state: "cooking" }];
  inactivite.progres(7, { kind: "commit", by: "agent", at: at(0) });
  avancer(30);
  await inactivite.passer(tickets);
  assert.equal(reveils.length, 1);
  for (let i = 0; i < 5; i++) {
    avancer(5);
    await inactivite.passer(tickets);
  }
  assert.equal(reveils.length, 1, "still silent, same period: no new wake");
  // Une progression, puis un nouveau silence de 30 minutes : un deuxième réveil.
  inactivite.progres(7, { kind: "ci", by: "agent", at: at(60) });
  avancer(29);
  await inactivite.passer(tickets);
  assert.equal(reveils.length, 1);
  avancer(1);
  await inactivite.passer(tickets);
  assert.equal(reveils.length, 2);
});
