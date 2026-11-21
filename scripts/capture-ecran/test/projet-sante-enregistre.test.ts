// L'écran du plafond de durée proposé par une pull request (#2490) : le chef tape 150 dans la durée des gates et quitte le champ
// (la valeur s'applique à son `change`), puis la rangée de ce même plafond est montrée.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ecran } from "../ecrans/projet-sante-enregistre.ts";

test("the screen types 150 in the gates duration and leaves the field, then scrolls to that same row", () => {
  const saisie = ecran.etapes.find((e) => "saisir" in e);
  assert.ok(saisie !== undefined && "saisir" in saisie);
  assert.match(saisie.saisir, /data-cle="gatesSeconds"/);
  assert.equal(saisie.texte, "150");
  assert.equal(saisie.valider, true);
  const defilement = ecran.etapes.find((e) => "defiler" in e);
  assert.ok(defilement !== undefined && "defiler" in defilement);
  assert.match(defilement.defiler, /data-cle="gatesSeconds"/);
});
