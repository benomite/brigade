import assert from "node:assert/strict";
import { test } from "node:test";
import { capitals, count } from "../src/format.ts";

test("un millier prend une virgule, un décimal un point", () => {
  assert.equal(count(1234), "1,234");
  assert.equal(count(1234.5), "1,234.5");
});


test("les majuscules ne suivent aucune locale française", () => {
  assert.equal(capitals("ab"), "AB");
});
