// #3880, critère 1 : la cause des renvois « blocking review » — une mutation qui survit (« Mutation check ») —
// est corrigée à sa source : la consigne de relecture du cook lui dit, avant de commiter, de muter à la main
// les lignes qu'il change et de voir un test échouer sur chacune, comme la pass le fera.
import assert from "node:assert/strict";
import { test } from "node:test";
import { CONSIGNE_DE_RELECTURE } from "../../src/claude.ts";

test("the cook's self-review brief tells it to mutate its own changed lines and see a test fail on each, before committing", () => {
  assert.match(CONSIGNE_DE_RELECTURE, /mutation/i, "the brief never names the mutation check");
  assert.match(CONSIGNE_DE_RELECTURE, /surviv|surv[ie]t|survi/i, "the brief does not say a surviving mutation sends the delivery back");
  assert.match(CONSIGNE_DE_RELECTURE, /===.{0,40}!==|!==.{0,40}===/s, "the brief gives no example of a mutation (=== to !==)");
});
