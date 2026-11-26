// Test d'acceptation gelé (#4299), critère 3. Le contrat que ce test fixe, parce que le ticket le laisse ouvert :
// `app/src/delai-de-prise/cuisine.ts` exporte `direLeDelaiDeLaCuisine({ evenements, maintenant })` -> le texte de la vue cuisine ;
// le runtime exporte `mesurerLesDelais` / `direLeDelai` (`runtime/src/delai-de-prise/`) : même part et même médiane, pour les mêmes données.
import assert from "node:assert/strict";
import { test } from "node:test";
import { direLeDelaiDeLaCuisine } from "../../src/delai-de-prise/cuisine.ts";
import { direLeDelai } from "../../../runtime/src/delai-de-prise/ligne.ts";
import { mesurerLesDelais } from "../../../runtime/src/delai-de-prise/mesure.ts";

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

test("the kitchen view shows the same 50% share and 16.5 minute median as the status line", () => {
  const vue = direLeDelaiDeLaCuisine({ evenements: EVENEMENTS, maintenant: MAINTENANT });
  const ligne = direLeDelai(mesurerLesDelais({ evenements: EVENEMENTS, maintenant: MAINTENANT }));
  for (const texte of [vue, ligne]) {
    assert.match(texte, /50 ?%/);
    assert.match(texte, /16\.5/);
  }
});
