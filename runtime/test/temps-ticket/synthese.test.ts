import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { enregistrementsDuTexte, mediane, synthese, type EnregistrementTemps } from "../../src/temps-ticket/synthese.ts";

function enr(ticket: number, jour: number, cuisson: number, autres = 0): EnregistrementTemps {
  const mergedAt = new Date(Date.UTC(2026, 0, jour)).toISOString();
  return { ticket, claimedAt: mergedAt, mergedAt, cuisson, cuissonTests: autres, attentePasse: autres, revue: autres, ci: autres, merge: autres };
}

describe("the summary of recent tickets", () => {
  test("median of odd and even counts", () => {
    assert.equal(mediane([3, 1, 2]), 2);
    assert.equal(mediane([4, 1, 3, 2]), 2.5);
  });

  test("odd number of records", () => {
    const s = synthese([enr(1, 1, 100), enr(2, 2, 300), enr(3, 3, 200)], 15);
    assert.ok(s);
    assert.equal(s.mediane, 200);
    assert.deepEqual(s.plusLent, { ticket: 2, total: 300 });
    assert.equal(s.medianeParPhase.cuisson, 200);
    assert.equal(s.medianeParPhase.ci, 0);
    assert.equal(s.phaseDominante, "cuisson");
    assert.equal(s.depasseLeMax, false);
  });

  test("even number of records, and the over-the-max flag", () => {
    const s = synthese([enr(1, 1, 600), enr(2, 2, 1200)], 15);
    assert.ok(s);
    assert.equal(s.mediane, 900);
    assert.equal(s.depasseLeMax, false);
    assert.equal(synthese([enr(1, 1, 600), enr(2, 2, 1200)], 10)?.depasseLeMax, true);
  });

  test("the dominant phase is the one with the largest median", () => {
    const e = { ...enr(1, 1, 10), revue: 500 };
    assert.equal(synthese([e], 15)?.phaseDominante, "revue");
  });

  test("only the 10 most recent by mergedAt are used", () => {
    const tous = Array.from({ length: 12 }, (_, i) => enr(i + 1, i + 1, 100));
    tous[0] = enr(1, 1, 99999);
    const s = synthese(tous.reverse(), 15);
    assert.ok(s);
    assert.equal(s.plusLent.total, 100);
    assert.equal(s.mediane, 100);
  });

  test("an empty file gives no summary and no error", () => {
    assert.equal(synthese([], 15), undefined);
    assert.deepEqual(enregistrementsDuTexte("[]"), []);
    assert.deepEqual(enregistrementsDuTexte(undefined), []);
    assert.deepEqual(enregistrementsDuTexte(""), []);
    assert.deepEqual(enregistrementsDuTexte("{pas du json"), []);
  });

  test("loading keeps well-formed records only", () => {
    const bon = enr(1, 1, 5);
    assert.deepEqual(enregistrementsDuTexte(JSON.stringify([bon, { ticket: 2 }, null])), [bon]);
  });
});
