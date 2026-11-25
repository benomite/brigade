// #4116 — « reprends #N » et « c'est arrivé » : même chose, sans boîte ni commande de la boîte ; #4262 — par la même commande
// que les boutons (second/parking.ts, `unpark`).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const ROLE = readFileSync(join(import.meta.dirname, "..", "..", "src", "second", "role.md"), "utf8");

test("reprendre une carte et « c'est arrivé » passent par la commande de parking, sans `waiting resume`", () => {
  assert.ok(!/waiting resume/.test(ROLE), "le rôle renvoie encore vers `waiting resume`, qui exige la boîte");
  assert.match(ROLE, /<the parking command> unpark <owner>\/<repo>#<ticket>/, "le rôle ne dit pas de déparquer par la commande de parking");
  assert.ok(!/--remove-label waiting/.test(ROLE), "le rôle retire encore l'étiquette waiting à la main, hors du chemin de l'app");
  assert.ok(!/brigade <name> waiting/.test(ROLE), "le rôle cite encore une commande `brigade <name> waiting`");
});
