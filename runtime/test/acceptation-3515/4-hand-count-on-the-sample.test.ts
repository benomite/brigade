// #3515, critères 6 et 7 : chaque compte est reproductible — il liste les tickets derrière les bugs échappés et les shas
// derrière les reverts —, et sur l'échantillon commité de tickets fermés, les comptes, les tickets et les shas sont
// exactement ceux comptés à la main. Test d'acceptation : le calcul du runtime, sans GitHub.
import assert from "node:assert/strict";
import { test } from "node:test";
import { chiffresDAutonomie } from "../../src/autonomie/chiffres/chiffres.ts";
import { ECHANTILLON, MAINTENANT, sha } from "./echantillon.ts";

test("over 7 days the sample gives 3 escaped bugs on #101, #102, #103, #104 and 2 reverts aaaa… and eeee…, as counted by hand", () => {
  // Counted by hand: bugs #201 (#101), #203 (#102, #103), #207 (#104); reverts aaaa… (#101's commit), eeee… (#103's).
  const chiffres = chiffresDAutonomie([ECHANTILLON], 7, MAINTENANT);
  assert.equal(chiffres.bugsEchappes?.length, 3);
  assert.equal(chiffres.reverts?.length, 2);
  assert.deepEqual([...new Set(chiffres.bugsEchappes?.flatMap(({ tickets }) => tickets))].sort((a, b) => a - b), [101, 102, 103, 104]);
  assert.deepEqual(chiffres.bugsEchappes?.map(({ bug, tickets }) => [bug, tickets]), [[201, [101]], [203, [102, 103]], [207, [104]]]);
  assert.deepEqual(chiffres.reverts?.map((revert) => [revert.sha, revert.tickets]), [[sha("a"), [101]], [sha("e"), [103]]]);
});
