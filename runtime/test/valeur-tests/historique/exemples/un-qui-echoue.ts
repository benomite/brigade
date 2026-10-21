// Un fichier de tests d'exemple, joué par `historique.test.ts` sous le vrai
// lanceur : son nom ne finit pas en `.test.ts`, la suite du runtime ne le prend pas.
import assert from "node:assert/strict";
import { describe, test } from "node:test";

describe("un groupe", () => {
  test("échoue", () => assert.equal(1, 2));
});
