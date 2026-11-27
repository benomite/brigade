// Critère 3 (#4273) : rail vide et N gestes retenus → « N splits wait for your OK », jamais « STOPPED — cause unknown »
// ni « waits for a place in the kitchen ».
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { sentenceOfRailEmpty } from "../../src/held/rail-empty.ts";

const action = (n: number) => ({ id: `g${n}`, kind: "split", summary: `split #${n} into 3 tickets`, reason: "held", approveCommand: `brigade manager approve g${n}`, heldAt: "2026-11-25T08:00:00Z" });

describe("le rail vide avec des gestes retenus (#4273)", () => {
  for (const [n, expected] of [[1, "1 splits wait for your OK"], [3, "3 splits wait for your OK"]] as const) {
    test(`N=${n} : « ${expected} », sans « STOPPED — cause unknown » ni « waits for a place in the kitchen »`, () => {
      const sentence = sentenceOfRailEmpty({ rail: 0, retenus: Array.from({ length: n }, (_, i) => action(i + 1)) });
      assert.ok(sentence !== null && sentence.includes(expected), String(sentence));
      assert.equal(sentence.includes("STOPPED — cause unknown"), false);
      assert.equal(sentence.includes("waits for a place in the kitchen"), false);
    });
  }
});
