// #4244, critère 3 : un arrêt sans cause connue dit toujours « cause unknown » (pas de régression).
// Contrat : voir le critère 1 (`statutDeLaCuisine` de runtime/src/arret-cuisine/arret-cuisine.ts, entrée avec `skipped`).
import assert from "node:assert/strict";
import { test } from "node:test";
import { statutDeLaCuisine } from "../../src/arret-cuisine/arret-cuisine.ts";

const SANS_CARTE = { queued: 2, taken: 0, inPass: 0, since: "2026-11-20T10:00:00.000Z" };

test("a stop with no known cause still says 'cause unknown'", () => {
  const texte = statutDeLaCuisine(SANS_CARTE);
  assert.ok(texte !== null);
  assert.match(texte, /cause unknown/i);
});

test("a skip whose reason has no code does not invent a cause: still 'cause unknown'", () => {
  const texte = statutDeLaCuisine({ ...SANS_CARTE, skipped: [{ ticket: 10, reason: "something-else" }] });
  assert.ok(texte !== null);
  assert.match(texte, /cause unknown/i);
});
