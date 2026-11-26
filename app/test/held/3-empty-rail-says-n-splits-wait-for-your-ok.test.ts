// Critère 3 (#4273) : rail vide et N gestes retenus → « N splits wait for your OK », jamais « STOPPED — cause unknown »
// ni « waits for a place in the kitchen ».
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { phraseDuRailEmpty } from "../../src/held/rail-empty.ts";

const action = (n: number) => ({ id: `g${n}`, kind: "split", summary: `split #${n} into 3 tickets`, reason: "held", approveCommand: `brigade manager approve g${n}`, heldAt: "2026-11-25T08:00:00Z" });

describe("le rail vide avec des gestes retenus (#4273)", () => {
  for (const [n, attendu] of [[1, "1 splits wait for your OK"], [3, "3 splits wait for your OK"]] as const) {
    test(`N=${n} : « ${attendu} », sans « STOPPED — cause unknown » ni « waits for a place in the kitchen »`, () => {
      const phrase = phraseDuRailEmpty({ rail: 0, retenus: Array.from({ length: n }, (_, i) => action(i + 1)) });
      assert.ok(phrase !== null && phrase.includes(attendu), String(phrase));
      assert.equal(phrase.includes("STOPPED — cause unknown"), false);
      assert.equal(phrase.includes("waits for a place in the kitchen"), false);
    });
  }
});
