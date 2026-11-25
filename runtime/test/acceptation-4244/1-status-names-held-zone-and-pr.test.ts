// #4244, critère 1 : tous les tickets cuisinables sautés pour `zone-held` : le statut nomme le numéro de PR et dit que la zone est tenue.
// Contrat posé par les tests d'acceptation du ticket #4244 (le cook le suit) :
//   runtime/src/arret-cuisine/arret-cuisine.ts exporte `statutDeLaCuisine(entree)` → string | null : le texte du statut, en une ligne
//     (null quand la cuisine n'est pas arrêtée). `entree` est celle de `arretDeLaCuisine`, plus `skipped?: { ticket: number; reason: string; pr?: number }[]`
//     — les sauts de la porte de prise, un par ticket cuisinable ; `reason: "zone-held"` porte le numéro `pr` de la PR qui tient la zone.
//     Tous les tickets cuisinables sautés pour `zone-held` : « Waiting: zone held by PR 4077 ». Sans cause connue : « cause unknown » reste.
import assert from "node:assert/strict";
import { test } from "node:test";
import { statutDeLaCuisine } from "../../src/arret-cuisine/arret-cuisine.ts";

const SANS_CARTE = { queued: 2, taken: 0, inPass: 0, since: "2026-11-20T10:00:00.000Z" };

test("every cookable ticket skipped for zone-held: the status says the zone is held and names the PR", () => {
  const texte = statutDeLaCuisine({
    ...SANS_CARTE,
    skipped: [
      { ticket: 10, reason: "zone-held", pr: 4077 },
      { ticket: 11, reason: "zone-held", pr: 4077 },
    ],
  });
  assert.ok(texte !== null);
  assert.match(texte, /4077/);
  assert.match(texte, /zone/i);
  assert.match(texte, /held/i);
  assert.ok(!texte.includes("\n"), "one line");
});
