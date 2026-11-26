// Test d'acceptation gelé (#4230), critère 1. Le contrat que ces tests fixent, parce que le ticket le laisse ouvert :
// `runtime/src/risque/risque.ts` exporte `rangDuGenre(fiche, genre)` -> "chef" | "safe" (fiche = la fiche du projet lue, objet ou null ;
// le classement est son champ `risk`, genre -> rang ; genres : "publish", "pay", "write-to-client", "fix-typo").
import assert from "node:assert/strict";
import { test } from "node:test";
import { rangDuGenre } from "../../src/risque/risque.ts";

test("a project sheet with no ranking gives 'chef' for publish, pay and write to a client", () => {
  for (const fiche of [null, {}, { version: 1 }]) {
    for (const genre of ["publish", "pay", "write-to-client"]) assert.equal(rangDuGenre(fiche, genre), "chef", genre);
  }
});
