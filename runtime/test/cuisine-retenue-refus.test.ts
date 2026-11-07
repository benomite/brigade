// Une cuisine oisive dont tous les `fire` ouverts sont refusés par le manager (#2694).
import assert from "node:assert/strict";
import { test } from "node:test";
import { REFUS_APRES_MS, refusDeLaCuisine, type RefusDuManager } from "../src/cuisine-retenue-refus.ts";
import { detecterRetenue, direRetenueEn, SANS_SIGNAL, type Observation } from "../src/retenue/retenue.ts";
import type { TicketRail } from "../src/projections/rail.ts";

const A = (hhmmss: string) => `2026-11-07T${hhmmss}.000Z`;
const IDLE = A("08:00:00");

// Le rail du 7 novembre : trois `fire` refusés, chacun avec son manque.
const REFUS: RefusDuManager[] = [
  { ticket: 2680, manque: "no acceptance criteria", at: IDLE },
  { ticket: 2681, manque: "zone not named", at: IDLE },
  { ticket: 2682, manque: "scope too wide", at: IDLE },
];
const rail = (...etats: Array<[number, string]>) => etats.map(([ticket, state]) => ({ ticket, state }) as TicketRail);
const entree = (surcharge: Partial<Parameters<typeof refusDeLaCuisine>[0]> = {}) => ({ rail: [], refus: REFUS, enAttente: [], dernierService: null, ouverture: A("07:00:00"), ...surcharge });
const apres = (minutes: number) => new Date(Date.parse(IDLE) + minutes * 60_000);

test("cuisine oisive, rien de prenable, tous les fire refusés : absente avant 15 min, présente à 15 min, avec chaque ticket et son manque", () => {
  assert.equal(REFUS_APRES_MS, 15 * 60_000);
  assert.equal(refusDeLaCuisine(entree(), apres(14)), null);
  const refusees = refusDeLaCuisine(entree(), apres(15));
  assert.deepEqual(refusees?.tickets, [2680, 2681, 2682]);
  assert.deepEqual(refusees?.lines, ["#2680 refused by the manager, gap: no acceptance criteria", "#2681 refused by the manager, gap: zone not named", "#2682 refused by the manager, gap: scope too wide"]);
});

test("la ligne de la cuisine retenue nomme les tickets et les manques, via le détecteur existant", () => {
  const observation = (maintenant: Date): Observation => ({ eteinte: false, enAttente: [], attenteDepuis: null, dernierService: null, ouverture: A("07:00:00"), refusees: refusDeLaCuisine(entree(), maintenant) });
  assert.equal(detecterRetenue(observation(apres(14)), SANS_SIGNAL, apres(14)), null);
  const retenue = detecterRetenue(observation(apres(15)), SANS_SIGNAL, apres(15));
  const ligne = direRetenueEn(retenue!);
  for (const attendu of ["#2680 refused by the manager, gap: no acceptance criteria", "#2681 refused by the manager, gap: zone not named", "#2682 refused by the manager, gap: scope too wide"]) assert.ok(ligne.includes(attendu), ligne);
});

test("un fire non refusé, un cook en cours ou un ticket prenable : pas de ligne", () => {
  assert.equal(refusDeLaCuisine(entree({ rail: rail([2683, "waiting"]) }), apres(60)), null);
  assert.equal(refusDeLaCuisine(entree({ rail: rail([2683, "taken"]) }), apres(60)), null);
  assert.equal(refusDeLaCuisine(entree({ enAttente: [2683] }), apres(60)), null);
  assert.equal(refusDeLaCuisine(entree({ refus: [] }), apres(60)), null);
  assert.ok(refusDeLaCuisine(entree({ rail: rail([2680, "86"]) }), apres(60)));
});
