// Les écrans des rejeux de #3812 et de #3813 (#3823) : ce que la vue reçoit est ce que l'app tire du rail de « parade » sur
// GitHub, tenu 26 h sans rien servir — l'alerte en tête et sa cause, la station vue il y a 30 s, le cook pris il y a 1 min.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ecran as baseRouge } from "../ecrans/rail-alerte-base-rouge.ts";
import { ecran as boucle } from "../ecrans/rail-alerte-boucle.ts";
import type { Ecran } from "../ecrans/commun.ts";

type Tableau = { alertesDuRail?: Array<{ sorte: string; cause?: string; phrase: string; geree: string | null }>; stations?: { lignes: Array<{ station: string; vueLe: string }> }; rail?: { colonnes: Array<{ cartes?: Array<{ ticket: number; dit: Array<{ libelle: string; valeur: string }> }> }> } };
const tableauDeParade = (ecran: Ecran): Tableau => {
  const { envois } = ecran.donnees() as { envois: { faits: Array<{ sur: string; args: Array<{ projet: string; tableau?: Tableau }> }> } };
  const recu = envois.faits.find(({ sur, args }) => sur === "surFaits" && args[0]?.projet === "parade" && args[0].tableau !== undefined);
  return recu?.args[0]?.tableau ?? assert.fail("aucun tableau pour parade");
};

describe("les écrans des rejeux de #3812 et #3813", () => {
  test("#3812 : rien servi depuis 26 h, main rouge pour cause, et la réparation que la cuisine cuit ; la station vue il y a 30 s", () => {
    const tableau = tableauDeParade(baseRouge);
    assert.deepEqual(tableau.alertesDuRail?.map(({ sorte, cause, phrase, geree }) => ({ sorte, cause, phrase, geree }))[0], { sorte: "cuisine-muette", cause: "base-rouge", phrase: "Nothing served for 26 h while #12 is ready. The main branch is red (runtime tests), so nothing merges.", geree: "The kitchen repairs it on #12." });
    assert.deepEqual(tableau.stations?.lignes.map(({ station, vueLe }) => ({ station, vueLe })), [{ station: "box/claude", vueLe: "2026-10-13T10:03:42.000Z" }]);
  });

  test("#3813 : rien servi depuis 26 h, #14 relancé en boucle, et le cook qui le tient depuis 1 min", () => {
    const tableau = tableauDeParade(boucle);
    assert.equal(tableau.alertesDuRail?.[0]?.cause, "relance-en-boucle");
    assert.match(tableau.alertesDuRail?.[0]?.phrase ?? "", /^Nothing served for 26 h while #21 is ready\. #14 is relaunched in a loop\./);
    const carte = tableau.rail?.colonnes.flatMap(({ cartes }) => cartes ?? []).find(({ ticket }) => ticket === 14);
    assert.ok(carte?.dit.some(({ libelle, valeur }) => libelle === "right now" && valeur === "cooking, for 1 min"), JSON.stringify(carte?.dit));
  });
});
