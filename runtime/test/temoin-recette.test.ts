import assert from "node:assert/strict";
import { describe, test } from "node:test";

describe("Témoin de recette", () => {
  test.todo("ce test échoue volontairement", () => {
    assert.fail("Test témoin de recette en échec");
  });
});
