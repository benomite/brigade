// Ce que la carte de l'app relit d'une attente dite (#3763) : le ticket attendu de chaque source, jamais un `#N` de la
// phrase du corps citée — la carte en tire ses liens, et un mot changé dans `direLAttente` ne les fait pas tomber en silence.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ATTENTE_DITE, direLAttente } from "../../src/attente-du-rail/raison.ts";

test("chaque attente dite se relit en son ticket, quelle que soit sa source ; la phrase citée n'en donne aucun", () => {
  const ligne = [
    direLAttente({ ticket: 12, source: "corps", phrase: "Builds on #11, waits for #9 — read from nowhere" }),
    direLAttente({ ticket: 14, source: "fiche" }),
    direLAttente({ ticket: 15, source: "arret" }),
  ].join("; ");
  assert.deepEqual([...ligne.matchAll(ATTENTE_DITE)].map(([, n]) => Number(n)), [12, 14, 15]);
});
