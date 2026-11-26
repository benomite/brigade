// #4244, critère 4 : plusieurs PR tiennent des zones : le statut nomme celle qui bloque le plus de tickets, ou le plus petit numéro à égalité.
// Contrat : voir le critère 1 (`statutDeLaCuisine` de runtime/src/arret-cuisine/arret-cuisine.ts, entrée avec `skipped`).
import assert from "node:assert/strict";
import { test } from "node:test";
import { statutDeLaCuisine } from "../../src/arret-cuisine/arret-cuisine.ts";

const SANS_CARTE = { queued: 4, taken: 0, inPass: 0, since: "2026-11-20T10:00:00.000Z" };
const tenu = (ticket: number, pr: number) => ({ ticket, reason: "zone-held", pr });

test("the PR that blocks the most tickets is named", () => {
  const texte = statutDeLaCuisine({ ...SANS_CARTE, skipped: [tenu(10, 4100), tenu(11, 4077), tenu(12, 4100), tenu(13, 4100)] });
  assert.ok(texte !== null);
  assert.match(texte, /4100/);
  assert.doesNotMatch(texte, /4077/);
});

test("on a tie, the lowest PR number is named", () => {
  const texte = statutDeLaCuisine({ ...SANS_CARTE, skipped: [tenu(10, 4100), tenu(11, 4077), tenu(12, 4100), tenu(13, 4077)] });
  assert.ok(texte !== null);
  assert.match(texte, /4077/);
  assert.doesNotMatch(texte, /4100/);
});
