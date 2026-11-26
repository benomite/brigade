import assert from "node:assert/strict";
import { test } from "node:test";
import { consigne } from "../../src/claude.ts";
import { consigneDesTestsDeLaZone } from "../../src/tests-de-la-zone/tests-de-la-zone.ts";

test("the cook's instruction says the full suite runs in CI and that the cook does not run it", () => {
  const texte = consigne({ ticket: 1, titre: "t", depot: "o/r", base: "main" });
  assert.match(texte, /jamais la suite entière : elle tourne en CI et à la pass, et tu ne la lances pas/);
});

test("the tests to play are listed, with the rule that the full suite is not the cook's", () => {
  const texte = consigneDesTestsDeLaZone(["runtime/src/a"], ["runtime/test/a/x.test.ts"]);
  assert.match(texte, /`runtime\/test\/a\/x\.test\.ts`/);
  assert.match(texte, /do not run it yourself/);
});

test("with no test for the zone, the cook is told to write one", () => {
  assert.match(consigneDesTestsDeLaZone(["runtime/src/a"], []), /write a test for it/);
});
