// #4244, critère 2 : dans ce cas, le texte du statut ne contient jamais « cause unknown ».
// Contrat : voir le critère 1 (`statutDeLaCuisine` de runtime/src/arret-cuisine/arret-cuisine.ts, entrée avec `skipped`).
import assert from "node:assert/strict";
import { test } from "node:test";
import { statutDeLaCuisine } from "../../src/arret-cuisine/arret-cuisine.ts";

const SANS_CARTE = { queued: 2, taken: 0, inPass: 0, since: "2026-11-20T10:00:00.000Z" };

test("every cookable ticket skipped for zone-held: the status never says 'cause unknown'", () => {
  const texte = statutDeLaCuisine({ ...SANS_CARTE, skipped: [{ ticket: 10, reason: "zone-held", pr: 4077 }] });
  assert.ok(texte !== null);
  assert.doesNotMatch(texte, /cause unknown|cause is unknown/i);
  assert.match(texte, /4077/);
});
