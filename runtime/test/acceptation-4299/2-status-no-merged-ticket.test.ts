// Test d'acceptation gelé (#4299), critère 2. Contrat : `mesurerLesDelais({ evenements, maintenant })` de `runtime/src/delai-de-prise/mesure.ts`
// et `direLeDelai(mesure)` de `runtime/src/delai-de-prise/ligne.ts` (voir le critère 1) ; sans fusion sur 24 h, la ligne dit « no merged ticket » et rien ne jette.
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

test("with no ticket merged in the last 24 hours the line says 'no merged ticket' and nothing throws", () => {
  const vide = mesurerLesDelais({ evenements: [], maintenant: "2026-11-25T12:00:00.000Z" });
  assert.match(direLeDelai(vide), /no merged ticket/i);
  // events older than 24 hours do not count
  const vieux = mesurerLesDelais({ evenements: EVENEMENTS, maintenant: "2026-11-27T12:00:00.000Z" });
  assert.match(direLeDelai(vieux), /no merged ticket/i);
  assert.doesNotMatch(direLeDelai(vide), /NaN|undefined|error/i);
});
