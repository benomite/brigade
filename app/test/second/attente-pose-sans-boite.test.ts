// #4116 — le second met une carte en WAITING comme le bouton, sans commande de la boîte ; #4262 — par la même commande que
// le bouton joue (second/parking.ts), et non plus par une étiquette et un commentaire écrits à la main.
// #4129 — un ticket se parque à toute étape : seul un ticket déjà parqué est refusé.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const ROLE = readFileSync(join(import.meta.dirname, "..", "..", "src", "second", "role.md"), "utf8");

test("le second parque par la commande de parking — qui, quoi, jusqu'à quand —, sans `waiting set` ni étiquette posée à la main", () => {
  assert.ok(!/waiting set/.test(ROLE), "le rôle renvoie encore vers la commande `waiting set`, qui exige la boîte");
  assert.match(ROLE, /<the parking command> park <owner>\/<repo>#<ticket> --who '<who>' --what '<what>' --until <YYYY-MM-DD>/, "le rôle ne donne pas la commande de parking");
  assert.ok(!/--add-label waiting/.test(ROLE), "le rôle pose encore l'étiquette waiting à la main, hors du chemin de l'app");
  assert.ok(!ROLE.includes("<!-- brigade:waiting"), "le rôle écrit encore le commentaire marqué à la main, hors du chemin de l'app");
});

test("le second parque à toute étape — un ticket pris ou en pass compris — et ne refuse qu'un ticket déjà parqué", () => {
  assert.match(ROLE, /A ticket is parked from any step/);
  assert.match(ROLE, /Do not put on hold a ticket that already carries `parked`/);
  assert.doesNotMatch(ROLE, /`taken` or `in-pass`/, "le rôle refuse encore un ticket pris ou en pass");
});
