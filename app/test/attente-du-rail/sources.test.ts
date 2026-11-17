// Les liens d'une carte en file (ticket 3763). Ses lignes, source par source, sont dans jamais-awaiting-none-retenu.test.ts.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ligneEnAttente } from "../../src/ligne-carte.ts";

// Les liens d'une carte en file sont les tickets qu'elle attend, jamais un numéro de la phrase du corps qu'elle cite.
test("la carte n'ouvre que le ticket attendu, pas ceux de la phrase citée", () => {
  const ligne = "waits for #1912 — read from the body: 'Builds on #1908'; waits for #4 — read from the card";
  assert.deepEqual(ligneEnAttente("en attente", undefined, ligne), { ligne, liens: [1912, 4] });
});
