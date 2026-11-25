// Test d'acceptation gelé (#4276), critère 3. Le contrat que ce test fixe, parce que le ticket le laisse ouvert :
// `runtime/src/cook-humain/etapes-de-la-pass.ts` exporte `etapesDeLaPass({ auteur, labels })` -> `string[]`, les étapes de la
// pass, dans l'ordre, pour une livraison ouverte par `auteur` sur un ticket portant `labels`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { etapesDeLaPass } from "../../src/cook-humain/etapes-de-la-pass.ts";

test("a PR opened by the human for a marked ticket goes through the same pass steps, in the same order, as a cook's PR", () => {
  const cook = etapesDeLaPass({ auteur: "brigade-cook", labels: ["fire", "taken"] });
  const humain = etapesDeLaPass({ auteur: "alice", labels: ["fire", "human-cook"] });
  assert.ok(cook.length > 0);
  assert.deepEqual(humain, cook);
});
