// #4116 — « reprends #N » et « c'est arrivé » : même chose, sans boîte ni commande dédiée.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const ROLE = readFileSync(join(import.meta.dirname, "..", "..", "src", "second", "role.md"), "utf8");

test("reprendre une carte et « c'est arrivé » passent par l'étiquette, sans `waiting resume`", () => {
  assert.ok(!/waiting resume/.test(ROLE), "le rôle renvoie encore vers `waiting resume`, qui exige la boîte");
  assert.ok(/--remove-label waiting/.test(ROLE), "le rôle ne dit pas de retirer l'étiquette waiting");
  assert.ok(!/brigade <name> waiting/.test(ROLE), "le rôle cite encore une commande `brigade <name> waiting`");
});
