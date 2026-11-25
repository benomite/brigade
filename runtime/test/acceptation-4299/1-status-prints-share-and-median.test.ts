// Test d'acceptation gelé (#4299), critère 1. Le contrat que ce test fixe, parce que le ticket le laisse ouvert :
// `runtime/src/delai-de-prise/mesure.ts` exporte `mesurerLesDelais({ evenements, maintenant })` -> `{ nombre, part, medianeMin }`
// (`part` : fraction 0..1 des tickets fusionnés en 10 min ou moins sur les 24 h ; `medianeMin` : minutes) ;
// `runtime/src/delai-de-prise/ligne.ts` exporte `direLeDelai(mesure)` -> la ligne de `brigade <project> status`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { direLeDelai } from "../../src/delai-de-prise/ligne.ts";
import { mesurerLesDelais } from "../../src/delai-de-prise/mesure.ts";

// Fixed events: ticket 1 merged in 8 minutes; ticket 2 in 25 minutes with one send-back. `phases` tile `pris`..`fusionne`.
const MAINTENANT = "2026-11-25T12:00:00.000Z";
const t = (min: number) => new Date(Date.UTC(2026, 10, 25, 10, min)).toISOString();
const EVENEMENTS = [
  { ticket: 1, pris: t(0), fusionne: t(8), phases: [
    { type: "cook", debut: t(0), fin: t(5) }, { type: "gates", debut: t(5), fin: t(6) }, { type: "review", debut: t(6), fin: t(8) } ] },
  { ticket: 2, pris: t(0), fusionne: t(25), phases: [
    { type: "cook", debut: t(0), fin: t(10) }, { type: "gates", debut: t(10), fin: t(15) }, { type: "review", debut: t(15), fin: t(19) },
    { type: "send-back", debut: t(19), fin: t(22) }, { type: "wait", debut: t(22), fin: t(25) } ] },
];

test("with one ticket at 8 minutes and one at 25, the status line gives a 50% share and a 16.5 minute median", () => {
  const mesure = mesurerLesDelais({ evenements: EVENEMENTS, maintenant: MAINTENANT });
  assert.equal(mesure.part, 0.5);
  assert.equal(mesure.medianeMin, 16.5);
  const ligne = direLeDelai(mesure);
  assert.equal(ligne.includes("\n"), false);
  assert.match(ligne, /50 ?%/);
  assert.match(ligne, /16\.5/);
  assert.match(ligne, /24 ?h/);
});
