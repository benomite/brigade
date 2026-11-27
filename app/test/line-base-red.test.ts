// Ticket #3840 — la ligne d'une carte du Pass tenue par une base rouge : « waits for main to be green », avec sa durée
// quand on la connaît, sans durée sinon (et alors la ligne est un repère).
import assert from "node:assert/strict";
import { test } from "node:test";
import { lineBaseRed } from "../src/line-card.ts";

test("avec une durée, la ligne la dit après un point médian", () => {
  assert.deepEqual(lineBaseRed("32 min"), { ligne: "waits for main to be green · 32 min" });
});

test("sans durée, la ligne est nue et c'est un repère", () => {
  assert.deepEqual(lineBaseRed(""), { ligne: "waits for main to be green", repere: true });
});
