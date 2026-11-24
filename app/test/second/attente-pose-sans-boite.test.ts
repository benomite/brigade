// #4116 — le second met une carte en WAITING comme le bouton : l'étiquette `waiting` et le commentaire marqué, sans commande de la boîte.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const ROLE = readFileSync(join(import.meta.dirname, "..", "..", "src", "second", "role.md"), "utf8");

test("le second pose l'étiquette waiting et le commentaire marqué lui-même, sans `waiting set`", () => {
  assert.ok(!/waiting set/.test(ROLE), "le rôle renvoie encore vers la commande `waiting set`, qui exige la boîte");
  assert.ok(ROLE.includes("<!-- brigade:waiting"), "le rôle ne donne pas le commentaire marqué à écrire");
  assert.ok(/--add-label waiting/.test(ROLE), "le rôle ne dit pas de poser l'étiquette waiting avec gh");
  for (const champ of ["what", "who", "followUp"]) assert.ok(ROLE.includes(champ), `le marqueur ne porte pas ${champ}`);
});
