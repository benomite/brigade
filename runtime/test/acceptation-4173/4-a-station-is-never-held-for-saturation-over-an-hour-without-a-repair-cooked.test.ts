// Test d'acceptation gelé (#4173), critère 4. Le contrat que ce test fixe, parce que le ticket le laisse ouvert :
// `runtime/src/reparation.ts` exporte `suiteDeLaSaturation({ heldAt, maintenant, reparationCuisinee })` -> "attendre" | "forcer-la-reparation".
// `heldAt` : l'instant ISO où la station est retenue pour la machine ; `reparationCuisinee` : une réparation a été prise depuis.
// Passé une heure de retenue sans réparation cuisinée, la cuisine force la réparation ; avant, ou une fois cuisinée, elle attend.
import assert from "node:assert/strict";
import { test } from "node:test";
import { suiteDeLaSaturation } from "../../src/reparation.ts";

const HELD_AT = "2026-11-24T18:16:00.000Z";
const apres = (minutes: number) => new Date(Date.parse(HELD_AT) + minutes * 60_000);

test("held over one hour with no repair cooked, the repair is forced", () => {
  assert.equal(suiteDeLaSaturation({ heldAt: HELD_AT, maintenant: apres(61), reparationCuisinee: false }), "forcer-la-reparation");
  assert.equal(suiteDeLaSaturation({ heldAt: HELD_AT, maintenant: apres(240), reparationCuisinee: false }), "forcer-la-reparation");
});

test("held less than an hour, or with a repair cooked, nothing is forced", () => {
  assert.equal(suiteDeLaSaturation({ heldAt: HELD_AT, maintenant: apres(59), reparationCuisinee: false }), "attendre");
  assert.equal(suiteDeLaSaturation({ heldAt: HELD_AT, maintenant: apres(120), reparationCuisinee: true }), "attendre");
});
