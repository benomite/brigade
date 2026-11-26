// Test d'acceptation gelé (#4302), critère 1. Le contrat que ce test fixe, parce que le ticket le laisse ouvert :
// `runtime/src/renvoi-sur-le-fond/regle.ts` exporte `MOTIFS_DE_RENVOI` (la liste des motifs permis) et
// `verifierMotifDeRenvoi(motif: string)` : ne renvoie rien si le motif est permis, sinon lève une `Error` dont le message nomme les trois motifs permis.
import assert from "node:assert/strict";
import { test } from "node:test";
import { MOTIFS_DE_RENVOI, verifierMotifDeRenvoi } from "../../src/renvoi-sur-le-fond/regle.ts";

test("only wrong behaviour, unmet criterion and failing test are send-back reasons; any other is refused naming the allowed ones", () => {
  assert.deepEqual([...MOTIFS_DE_RENVOI].sort(), ["failing test", "unmet criterion", "wrong behaviour"]);
  for (const motif of MOTIFS_DE_RENVOI) assert.doesNotThrow(() => verifierMotifDeRenvoi(motif));
  assert.throws(
    () => verifierMotifDeRenvoi("test naming"),
    (e: Error) => /wrong behaviour/.test(e.message) && /unmet criterion/.test(e.message) && /failing test/.test(e.message),
  );
});
