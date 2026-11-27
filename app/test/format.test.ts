import assert from "node:assert/strict";
import { test } from "node:test";
import { dateHeure, heure, majuscules, nombre } from "../src/format.ts";

test("un millier prend une virgule, un décimal un point", () => {
  assert.equal(nombre(1234), "1,234");
  assert.equal(nombre(1234.5), "1,234.5");
});

test("une heure s'écrit à l'anglaise, sur douze heures", () => {
  const instant = new Date(2026, 0, 2, 15, 4, 5);
  assert.match(heure(instant), /^3:04:05\sPM$/);
  assert.match(dateHeure(instant), /^1\/2\/2026, 3:04:05\sPM$/);
});

test("les majuscules ne suivent aucune locale française", () => {
  assert.equal(majuscules("ab"), "AB");
});
