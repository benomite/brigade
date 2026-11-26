// Test d'acceptation gelé (#4302), critère 4. Le contrat que ce test fixe, parce que le ticket le laisse ouvert :
// `runtime/src/renvoi-sur-le-fond/regle.ts` exporte `commentaireDeRenvoi({ motif, detail })` -> `string`, le commentaire posé sur la PR :
// il énonce le motif (l'un de `MOTIFS_DE_RENVOI`) ; un motif hors liste est refusé (lève).
import assert from "node:assert/strict";
import { test } from "node:test";
import { MOTIFS_DE_RENVOI, commentaireDeRenvoi } from "../../src/renvoi-sur-le-fond/regle.ts";

test("each send-back comment states its reason from the list, and a reason outside the list cannot be commented", () => {
  for (const motif of MOTIFS_DE_RENVOI) {
    const commentaire = commentaireDeRenvoi({ motif, detail: "see the diff" });
    assert.ok(commentaire.includes(motif), `the comment states "${motif}"`);
  }
  assert.throws(() => commentaireDeRenvoi({ motif: "style", detail: "x" } as never));
});
