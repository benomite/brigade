// #4229 : le cook écrit ses tests avec son travail, dans la même PR, et la relecture les juge ; aucun test n'est gelé.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const COOK = readFileSync(new URL("../../agents/cook.md", import.meta.url), "utf8");

test("the cook's instructions say to write the tests with the work and that the review judges them, and name no frozen test", () => {
  assert.match(COOK, /## Tu écris les tests avec ton travail, et la relecture les juge/);
  assert.match(COOK, /dans la même PR/);
  assert.match(COOK, /tu peux changer n'importe quel fichier de test de ta PR/);
  assert.doesNotMatch(COOK, /gelé|frozen|Acceptance-Tests/i);
});
