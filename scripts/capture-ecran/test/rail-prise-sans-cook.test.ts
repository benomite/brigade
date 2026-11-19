// L'écran de #3884 : #14 est pris et son cook cuit, #15 est pris et aucun cook ne le tient — seule sa carte porte `sansCook`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ecran } from "../ecrans/rail-prise-sans-cook.ts";

type Tableau = { rail?: { colonnes: Array<{ cartes?: Array<{ ticket: number; sansCook?: true }> }> } };

test("#3884 : la carte de #15, sans cook, le dit ; celle de #14, dont un cook cuit, non", () => {
  const { envois } = ecran.donnees() as { envois: { faits: Array<{ sur: string; args: Array<{ projet: string; tableau?: Tableau }> }> } };
  const tableau = envois.faits.find(({ sur, args }) => sur === "surFaits" && args[0]?.projet === "parade" && args[0].tableau !== undefined)?.args[0]?.tableau ?? assert.fail("aucun tableau pour parade");
  const cartes = tableau.rail?.colonnes.flatMap(({ cartes }) => cartes ?? []) ?? [];
  assert.equal(cartes.find(({ ticket }) => ticket === 14)?.sansCook, undefined);
  assert.equal(cartes.find(({ ticket }) => ticket === 15)?.sansCook, true);
});
