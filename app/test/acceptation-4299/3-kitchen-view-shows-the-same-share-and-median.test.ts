// Test d'acceptation gelé (#4299), critère 3. Le contrat que ce test fixe, parce que le ticket le laisse ouvert :
// `app/src/delay-of-taking/kitchen.ts` exporte `direLeDelaiDeLaCuisine({ evenements, maintenant })` -> le texte de la vue cuisine ;
// le runtime exporte `mesurerLesDelais` / `direLeDelai` (`runtime/src/delai-de-prise/`) : même part et même médiane, pour les mêmes données.
import assert from "node:assert/strict";
import { test } from "node:test";
import { tellTheDelayOfTheKitchen } from "../../src/delay-of-taking/kitchen.ts";
import { direLeDelai } from "../../../runtime/src/delai-de-prise/ligne.ts";
import { mesurerLesDelais } from "../../../runtime/src/delai-de-prise/mesure.ts";

// Fixed events: ticket 1 merged in 8 minutes; ticket 2 in 25 minutes with one send-back. `phases` tile `pris`..`fusionne`.
const NOW = "2026-11-25T12:00:00.000Z";
const t = (min: number) => new Date(Date.UTC(2026, 10, 25, 10, min)).toISOString();
const EVENTS = [
  { ticket: 1, pris: t(0), fusionne: t(8), phases: [
    { type: "cook", debut: t(0), fin: t(5) }, { type: "gates", debut: t(5), fin: t(6) }, { type: "review", debut: t(6), fin: t(8) } ] },
  { ticket: 2, pris: t(0), fusionne: t(25), phases: [
    { type: "cook", debut: t(0), fin: t(10) }, { type: "gates", debut: t(10), fin: t(15) }, { type: "review", debut: t(15), fin: t(19) },
    { type: "send-back", debut: t(19), fin: t(22) }, { type: "wait", debut: t(22), fin: t(25) } ] },
];

test("the kitchen view shows the same 50% share and 16.5 minute median as the status line", () => {
  const vue = tellTheDelayOfTheKitchen({ evenements: EVENTS, maintenant: NOW });
  const line = direLeDelai(mesurerLesDelais({ evenements: EVENTS, maintenant: NOW }));
  for (const text of [vue, line]) {
    assert.match(text, /50 ?%/);
    assert.match(text, /16\.5/);
  }
});
