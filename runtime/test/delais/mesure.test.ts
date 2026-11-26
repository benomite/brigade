// La mesure du temps de la prise au merge (#4299) : la part en 10 minutes ou moins, la médiane, sur 24 heures, et le partage d'un ticket.
import assert from "node:assert/strict";
import { test } from "node:test";
import { decomposer, type Evenement, mesurerLesDelais } from "../../src/delais/mesure.ts";
import { EVENEMENTS, MAINTENANT, t } from "./jeu.ts";

const seul = (ticket: number, pris: string, fusionne: string): Evenement => ({ ticket, pris, fusionne, phases: [] });

test("the fixed set: 8 minutes and 25 minutes give a 50% share and a 16.5 minute median", (ctx) => {
  const mesure = mesurerLesDelais({ evenements: EVENEMENTS, maintenant: MAINTENANT });
  ctx.diagnostic(`share ${mesure.part}, median ${mesure.medianeMin} min, over ${mesure.nombre} tickets`);
  assert.deepEqual(mesure, { nombre: 2, part: 0.5, medianeMin: 16.5 });
});

test("the 25 minute ticket splits into cook 10, gates 5, review 4, send-backs 3, waits 3; the 8 minute one into 5, 1, 2, 0, 0", (ctx) => {
  const lent = decomposer(EVENEMENTS[1]);
  ctx.diagnostic(`#2: ${JSON.stringify(lent)} · #1: ${JSON.stringify(decomposer(EVENEMENTS[0]))}`);
  assert.deepEqual(lent, { totalMin: 25, parts: { cook: 10, gates: 5, review: 4, "send-back": 3, wait: 3 } });
  assert.deepEqual(decomposer(EVENEMENTS[0]), { totalMin: 8, parts: { cook: 5, gates: 1, review: 2, "send-back": 0, wait: 0 } });
});

test("a ticket merged at exactly 10 minutes counts within the target; one at 10 min 1 s does not", () => {
  assert.equal(mesurerLesDelais({ evenements: [seul(1, t(0), t(10))], maintenant: MAINTENANT }).part, 1);
  assert.equal(mesurerLesDelais({ evenements: [seul(1, t(0), t(10, 1))], maintenant: MAINTENANT }).part, 0);
});

test("the window is the 24 hours that end now: merged exactly 24 h ago counts, earlier or later does not", () => {
  const il_y_a_24h = "2026-11-24T12:00:00.000Z";
  const dedans = seul(1, "2026-11-24T11:55:00.000Z", il_y_a_24h);
  const avant = seul(2, "2026-11-24T11:50:00.000Z", "2026-11-24T11:59:59.000Z");
  const apres = seul(3, "2026-11-25T11:59:00.000Z", "2026-11-25T12:00:01.000Z");
  assert.deepEqual(mesurerLesDelais({ evenements: [dedans, avant, apres], maintenant: MAINTENANT }), { nombre: 1, part: 1, medianeMin: 5 });
});

test("an odd count takes the middle one; a merge before its claim is left out", () => {
  const evenements = [seul(1, t(0), t(3)), seul(2, t(0), t(40)), seul(3, t(0), t(12)), seul(4, t(30), t(20))];
  assert.deepEqual(mesurerLesDelais({ evenements, maintenant: MAINTENANT }), { nombre: 3, part: 1 / 3, medianeMin: 12 });
});

test("no merged ticket: no share and no median, never 0", () => {
  assert.deepEqual(mesurerLesDelais({ evenements: [], maintenant: MAINTENANT }), { nombre: 0, part: null, medianeMin: null });
});

test("the parts are cut at the claim and the merge, an uncovered span or an unknown phase is a wait, and the tenths add up to the total", () => {
  const e: Evenement = {
    ticket: 5,
    pris: t(0),
    fusionne: t(12, 20),
    phases: [
      { type: "cook", debut: t(-3), fin: t(4, 10) },
      { type: "review", debut: t(6), fin: t(9, 5) },
      { type: "gates", debut: t(9, 5), fin: t(13) },
      { type: "lunch", debut: t(4, 10), fin: t(5) },
    ],
  };
  const { totalMin, parts } = decomposer(e);
  assert.equal(totalMin, 12.3);
  // cook 4.17, wait 1.83, review 3.08, gates 3.25 : au plus fort reste, 4.2 + 1.8 + 3.1 + 3.2 = 12.3.
  assert.deepEqual(parts, { cook: 4.2, gates: 3.2, review: 3.1, "send-back": 0, wait: 1.8 });
});
