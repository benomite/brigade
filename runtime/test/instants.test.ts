// Les instants et les durées que le chef tape : lus à l'heure qu'on leur donne, dits en UTC écrit en lettres.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { dateLocale, direInstant, direInstantEn, dureeTapee } from "../src/instants.ts";

describe("les instants", () => {
  test("un instant se dit en UTC écrit en lettres, en français ou en anglais", () => {
    assert.equal(direInstant("2026-10-12T19:20:36.681Z"), "12 oct. 19:20 UTC");
    assert.equal(direInstantEn("2026-10-12T19:20:36.681Z"), "12 Oct 19:20 UTC");
    assert.equal(direInstantEn("2026-01-05T04:07:00.000Z"), "5 Jan 04:07 UTC");
  });

  test("une durée tapée se lit en millisecondes, ou pas du tout", () => {
    assert.equal(dureeTapee("30min"), 30 * 60_000);
    assert.equal(dureeTapee("4h"), 4 * 3_600_000);
    assert.equal(dureeTapee("1h30"), 90 * 60_000);
    assert.equal(dureeTapee("2d"), 48 * 3_600_000);
    assert.equal(dureeTapee("2j"), 48 * 3_600_000);
    for (const illisible of ["", "0h", "0min", "4", "h", "1h60", "-2d"]) assert.equal(dureeTapee(illisible), null, illisible);
  });

  test("une date locale qui n'existe pas ne se lit pas", () => {
    assert.ok(dateLocale(2026, 10, 12, 18, 0));
    assert.equal(dateLocale(2026, 2, 31, 18, 0), null);
  });
});
