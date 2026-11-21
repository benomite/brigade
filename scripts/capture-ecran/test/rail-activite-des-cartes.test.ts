// L'écran de #3923 : #14 est prise pour la troisième fois — deux essais finis, un qui cuit —, sa carte dit « 3rd try ».
import assert from "node:assert/strict";
import { test } from "node:test";
import { ecran } from "../ecrans/rail-activite-des-cartes.ts";

type Tableau = { rail?: { colonnes: Array<{ cartes?: Array<{ ticket: number; essai?: number; essais?: Array<{ enCours: boolean; dit: string }> }> }> } };

test("#3923 : la carte de #14 a deux essais finis et un qui cuit, et dit son troisième essai", () => {
  const { envois } = ecran.donnees() as { envois: { faits: Array<{ sur: string; args: Array<{ projet: string; tableau?: Tableau }> }> } };
  const tableau = envois.faits.find(({ sur, args }) => sur === "surFaits" && args[0]?.projet === "parade" && args[0].tableau !== undefined)?.args[0]?.tableau ?? assert.fail("aucun tableau pour parade");
  const carte = tableau.rail?.colonnes.flatMap(({ cartes }) => cartes ?? []).find(({ ticket }) => ticket === 14) ?? assert.fail("aucune carte #14");
  assert.equal(carte.essai, 3);
  assert.deepEqual(carte.essais?.map(({ enCours }) => enCours), [false, false, true]);
  assert.match(carte.essais?.[0]?.dit ?? "", /stopped after .*: idle/);
  assert.match(carte.essais?.[2]?.dit ?? "", /cooking now/);
});
