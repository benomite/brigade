// #4116, puis #4129 — « reprends #N » et « c'est arrivé » : même chose, sans boîte ni commande dédiée — `parked` retiré,
// et un commentaire qui le dit ; le ticket reprend exactement où il était.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const ROLE = readFileSync(join(import.meta.dirname, "..", "..", "src", "second", "role.md"), "utf8");

test("reprendre une carte et « c'est arrivé » passent par l'étiquette, sans `waiting resume`", () => {
  assert.ok(!/waiting resume/.test(ROLE), "le rôle renvoie encore vers `waiting resume`, qui exige la boîte");
  assert.ok(/--remove-label parked/.test(ROLE), "le rôle ne dit pas de retirer l'étiquette parked");
  assert.ok(!/--remove-label waiting/.test(ROLE), "le rôle retire encore l'étiquette waiting");
  assert.ok(!/brigade <name> (?:waiting|parked)/.test(ROLE), "le rôle cite encore une commande `brigade <name> waiting|parked`");
  assert.ok(ROLE.includes("**Unparked** — answered:"), "le rôle ne donne pas le commentaire de « reprends »");
  assert.ok(ROLE.includes("**Unparked — it arrived**:"), "le rôle ne donne pas le commentaire de « c'est arrivé »");
  assert.ok(!ROLE.includes("WAITING lifted"), "le rôle donne encore le commentaire d'avant #4129");
});
