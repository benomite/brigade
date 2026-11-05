import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { tempsMaxTicketMin, tempsMaxTicketMinDuTexte } from "../../src/temps-ticket/reglage.ts";

describe("the per-project max time of a ticket", () => {
  test("defaults to 15 minutes when the key is absent", () => {
    assert.equal(tempsMaxTicketMin({}), 15);
    assert.equal(tempsMaxTicketMinDuTexte(undefined), 15);
    assert.equal(tempsMaxTicketMinDuTexte("{}"), 15);
  });
  test("reads tempsMaxTicketMin", () => {
    assert.equal(tempsMaxTicketMin({ tempsMaxTicketMin: 8 }), 8);
    assert.equal(tempsMaxTicketMinDuTexte('{"tempsMaxTicketMin": 8}'), 8);
  });
  test("falls back to 15 on a negative, zero or non-numeric value", () => {
    for (const v of [-3, 0, "8", null, true, NaN, Infinity, [], {}]) assert.equal(tempsMaxTicketMin({ tempsMaxTicketMin: v }), 15);
  });
  test("falls back to 15 on a file that is not an object or not JSON", () => {
    for (const p of [null, undefined, 4, "x", []]) assert.equal(tempsMaxTicketMin(p), 15);
    assert.equal(tempsMaxTicketMinDuTexte("{pas du json"), 15);
  });
});
