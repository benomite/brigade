// Ticket #3840 — la ligne d'une carte du Pass tenue par une base rouge : « waits for main to be green », avec sa durée
// quand on la connaît, sans durée sinon (et alors la ligne est un repère).
import assert from "node:assert/strict";
import { test } from "node:test";
import { ligneBaseRouge } from "../src/ligne-carte.ts";

test("avec une durée, la ligne la dit après un point médian", () => {
  assert.deepEqual(ligneBaseRouge("32 min"), { ligne: "waits for main to be green · 32 min" });
});

test("sans durée, la ligne est nue et c'est un repère", () => {
  assert.deepEqual(ligneBaseRouge(""), { ligne: "waits for main to be green", repere: true });
});
