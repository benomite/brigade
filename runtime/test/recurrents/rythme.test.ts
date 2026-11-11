// Le rythme d'un ticket récurrent (#3230) : ce qui se lit, ce qui se refuse, et
// la date de chaque occurrence — un jour du mois absent du mois tombe sur son dernier jour.
import assert from "node:assert/strict";
import { test } from "node:test";
import { occurrenceApres, occurrenceDesLe, RecurrentInvalide, rythmeDe } from "../../src/recurrents/rythme.ts";

test("daily, weekly + weekday and monthly + day read as rhythms", () => {
  assert.deepEqual(rythmeDe({ kind: "daily" }), { kind: "daily" });
  assert.deepEqual(rythmeDe({ kind: "weekly", weekday: 7 }), { kind: "weekly", weekday: 7 });
  assert.deepEqual(rythmeDe({ kind: "monthly", dayOfMonth: 31 }), { kind: "monthly", dayOfMonth: 31 });
});

test("an unknown kind, a weekday or a day of month out of range is refused with a readable error", () => {
  const refus: Array<[unknown, RegExp]> = [
    [undefined, /rhythm is missing/],
    [{ kind: "yearly" }, /unknown rhythm “yearly”/],
    [{ kind: "weekly" }, /weekday undefined is out of range/],
    [{ kind: "weekly", weekday: 0 }, /weekday 0 is out of range: expected 1 \(Monday\) to 7 \(Sunday\)/],
    [{ kind: "weekly", weekday: 8 }, /weekday 8 is out of range/],
    [{ kind: "weekly", weekday: 2.5 }, /weekday 2.5 is out of range/],
    [{ kind: "monthly", dayOfMonth: 0 }, /day of month 0 is out of range: expected 1 to 31/],
    [{ kind: "monthly", dayOfMonth: 32 }, /day of month 32 is out of range/],
    [{ kind: "daily", weekday: 1 }, /a daily rhythm takes no weekday/],
  ];
  for (const [brut, message] of refus) assert.throws(() => rythmeDe(brut), (erreur: unknown) => erreur instanceof RecurrentInvalide && message.test(erreur.message), JSON.stringify(brut));
});

test("the next occurrence: daily the next day, weekly the next same weekday, monthly the next same day", () => {
  // 2026-11-11 est un mercredi.
  assert.equal(occurrenceApres({ kind: "daily" }, "2026-11-11"), "2026-11-12");
  assert.equal(occurrenceApres({ kind: "daily" }, "2026-12-31"), "2027-01-01");
  assert.equal(occurrenceApres({ kind: "weekly", weekday: 3 }, "2026-11-11"), "2026-11-18");
  assert.equal(occurrenceApres({ kind: "weekly", weekday: 1 }, "2026-11-11"), "2026-11-16");
  assert.equal(occurrenceApres({ kind: "weekly", weekday: 7 }, "2026-11-11"), "2026-11-15");
  assert.equal(occurrenceApres({ kind: "monthly", dayOfMonth: 11 }, "2026-11-11"), "2026-12-11");
  assert.equal(occurrenceApres({ kind: "monthly", dayOfMonth: 15 }, "2026-11-11"), "2026-11-15");
});

test("a 31st falls on the last day of a 30-day month and of February, and comes back to the 31st after", () => {
  const le31 = { kind: "monthly", dayOfMonth: 31 } as const;
  assert.equal(occurrenceApres(le31, "2026-10-31"), "2026-11-30");
  assert.equal(occurrenceApres(le31, "2026-11-30"), "2026-12-31");
  assert.equal(occurrenceApres(le31, "2027-01-31"), "2027-02-28");
  assert.equal(occurrenceApres(le31, "2027-02-28"), "2027-03-31");
  assert.equal(occurrenceApres(le31, "2028-01-31"), "2028-02-29");
  assert.equal(occurrenceApres({ kind: "monthly", dayOfMonth: 30 }, "2027-01-30"), "2027-02-28");
  // Déclaré un jour du mois, son premier jour est ce jour-là s'il tombe dessus.
  assert.equal(occurrenceDesLe(le31, "2026-11-30"), "2026-11-30");
  assert.equal(occurrenceDesLe({ kind: "weekly", weekday: 3 }, "2026-11-11"), "2026-11-11");
});
