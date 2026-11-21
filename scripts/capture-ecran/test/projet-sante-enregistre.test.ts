// L'écran de #3983 : le chef tape 150 dans la durée des gates, le champ est validé, puis l'écran défile jusqu'à cette même rangée.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ecran } from "../ecrans/projet-sante-enregistre.ts";

test("#3983 : l'écran valide la saisie de gatesSeconds puis défile jusqu'à sa rangée", () => {
  const etapes = ecran.etapes as Array<{ saisir?: string; texte?: string; valider?: boolean; defiler?: string }>;
  const saisie = etapes.find(({ saisir }) => saisir !== undefined);
  assert.match(saisie?.saisir ?? "", /data-cle="gatesSeconds"/);
  assert.equal(saisie?.texte, "150");
  assert.equal(saisie?.valider, true);
  assert.match(etapes.find(({ defiler }) => defiler !== undefined)?.defiler ?? "", /data-cle="gatesSeconds"/);
});
