// #4116, puis #4129 — le second parque une carte comme le bouton : l'étiquette `parked` et le commentaire marqué
// `<!-- brigade:parked … -->`, sans commande de la boîte ; à toute étape, en refusant seulement un ticket déjà parqué.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const ROLE = readFileSync(join(import.meta.dirname, "..", "..", "src", "second", "role.md"), "utf8");

test("le second pose l'étiquette parked et le commentaire marqué lui-même, sans `waiting set` ni `parked set`", () => {
  assert.ok(!/waiting set/.test(ROLE), "le rôle renvoie encore vers la commande `waiting set`, qui exige la boîte");
  assert.ok(!/parked set/.test(ROLE), "le rôle renvoie vers la commande `parked set` de la boîte");
  assert.ok(ROLE.includes("<!-- brigade:parked"), "le rôle ne donne pas le commentaire marqué à écrire");
  assert.ok(!ROLE.includes("<!-- brigade:waiting"), "le rôle donne encore la marque d'avant #4129");
  assert.ok(ROLE.includes("**PARKED: waits for <who>.** <what>"), "le rôle ne donne pas la ligne qui dit le parking");
  assert.ok(/--add-label parked/.test(ROLE), "le rôle ne dit pas de poser l'étiquette parked avec gh");
  assert.ok(!/--add-label waiting/.test(ROLE), "le rôle pose encore l'étiquette waiting");
  for (const champ of ["what", "who", "followUp", "fact"]) assert.ok(ROLE.includes(`"${champ}"`), `le marqueur ne porte pas ${champ}`);
});

test("le second parque à toute étape — `taken` et `in-pass` restent — et ne refuse qu'un ticket déjà parqué", () => {
  assert.match(ROLE, /A ticket is parked from any step/);
  assert.match(ROLE, /you leave those labels, and it resumes exactly where it was/);
  assert.match(ROLE, /Do not park a ticket that already carries `parked`/);
  assert.doesNotMatch(ROLE, /already carries `waiting`, `taken` or `in-pass`/, "le rôle refuse encore un ticket pris ou en pass");
});
