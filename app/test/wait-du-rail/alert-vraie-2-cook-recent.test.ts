// #3823, critère 2 : « no cook can start » est faux tant qu'un cook tourne, ou a tourné il y a moins de 5 minutes.
// Contrat : voir alert-vraie-1-entete.test.ts (`alertesDuRail`, app/src/wait-du-rail/alerts.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { alertsDuRail, type EntreeDesAlerts } from "../../src/wait-du-rail/alerts.ts";

const REPOSITORY = "chef/secondes";
const T0 = Date.parse("2026-11-18T12:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();
const entree = (surcharge: Partial<EntreeDesAlerts> = {}): EntreeDesAlerts => ({
  depot: REPOSITORY,
  maintenant: T0,
  tickets: [{ ticket: 4, etat: "queued", entreLe: iso(T0 - 3_600_000), depend: [] }],
  stations: { lues: [] },
  plafondAtteint: false,
  entete: { cuisinent: [] },
  cookEnCours: false,
  dernierCook: null,
  baseRouge: null,
  relances: [],
  dernierServiLe: iso(T0 - 3_600_000),
  ...surcharge,
});
const sansCook = (alerts: ReturnType<typeof alertsDuRail>) => alerts.filter(({ phrase }) => /no cook can start/.test(phrase));

describe("critère 2 : « no cook can start » est faux tant qu'un cook tourne ou a tourné il y a moins de 5 minutes", () => {
  test("un cook tourne : aucune alerte « no cook can start »", () => {
    assert.deepEqual(sansCook(alertsDuRail(entree({ cookEnCours: true }))), []);
  });

  test("un cook a fini il y a 4 min 59 s : aucune alerte", () => {
    assert.deepEqual(sansCook(alertsDuRail(entree({ dernierCook: iso(T0 - 299_000) }))), []);
  });

  test("le dernier cook a fini il y a plus de 5 minutes : l'alerte revient", () => {
    assert.equal(sansCook(alertsDuRail(entree({ dernierCook: iso(T0 - 301_000) }))).length, 1);
  });
});
