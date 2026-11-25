// Test d'acceptation gelé (#4272), critère 4.
// Le contrat que ce test fixe, parce que le ticket le laisse ouvert : `runtime/src/parked/parked.ts` exporte `ouvrirParked({ etapes })` -> `{ lire, … }` (fiche `{ ticket, who, for, until, step }`)
// et `runtime/src/parked/panne.ts` exporte `parquerLaPanne({ parked, ticket, texte })` : la panne qui levait un bandeau parque le ticket sur le chef, `for` = le texte de la panne.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ouvrirParked } from "../../src/parked/parked.ts";
import { parquerLaPanne } from "../../src/parked/panne.ts";

test("a fault that raised a banner before now parks the ticket on the chef, with the fault text as the for-what field", () => {
  const parked = ouvrirParked({ etapes: new Map([[9, "cooking" as const]]) });
  const texte = "the gates crashed: ENOSPC while writing the worktree";
  parquerLaPanne({ parked, ticket: 9, texte });
  const fiche = parked.lire(9);
  assert.equal(fiche?.who, "chef");
  assert.equal(fiche?.for, texte);
  assert.equal(fiche?.step, "cooking");
});
