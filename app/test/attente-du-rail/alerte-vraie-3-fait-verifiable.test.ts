// #3823, critère 3 : chaque alerte montrée porte un fait vérifiable — depuis quand, et quel ticket ou quel check.
// Contrat : voir alerte-vraie-1-entete.test.ts (`alertesDuRail`, app/src/attente-du-rail/alertes.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { alertesDuRail, type EntreeDesAlertes } from "../../src/attente-du-rail/alertes.ts";
import type { StationDuCompte } from "../../../runtime/src/attente-du-rail/stations.ts";

const DEPOT = "chef/secondes";
const T0 = Date.parse("2026-11-18T12:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();
const station = (surcharge: Partial<StationDuCompte> = {}): StationDuCompte => ({ name: "parade-box", lastSeen: iso(T0 - 30_000), stoppedAt: null, refreshMs: 120_000, selection: null, ...surcharge });
const entree = (surcharge: Partial<EntreeDesAlertes> = {}): EntreeDesAlertes => ({
  depot: DEPOT,
  maintenant: T0,
  tickets: [{ ticket: 4, etat: "queued", entreLe: iso(T0 - 3_600_000), depend: [] }],
  stations: { lues: [station()] },
  plafondAtteint: false,
  entete: { cuisinent: [] },
  cookEnCours: false,
  dernierCook: null,
  baseRouge: null,
  relances: [],
  dernierServiLe: iso(T0 - 3_600_000),
  ...surcharge,
});

const CAS: Record<string, EntreeDesAlertes> = {
  "aucune-station": entree({ stations: { lues: [] } }),
  "aucun-cook": entree({ stations: { lues: [station({ lastSeen: iso(T0 - 3_600_000) })] } }),
  "base-rouge": entree({ baseRouge: { depuis: iso(T0 - 7_200_000), check: "runtime tests", ticket: 3812 } }),
  "relance-en-boucle": entree({ relances: [{ ticket: 3813, fois: 1198, depuis: iso(T0 - 7_200_000) }] }),
};

describe("critère 3 : chaque alerte montrée porte un fait vérifiable", () => {
  for (const [sorte, cas] of Object.entries(CAS)) {
    test(`${sorte} : depuis quand, et quel ticket ou quel check`, () => {
      const alerte = alertesDuRail(cas).find((a) => a.sorte === sorte);
      assert.ok(alerte, `pas d'alerte ${sorte}`);
      assert.ok(!Number.isNaN(Date.parse(alerte.fait.depuis)), "depuis quand");
      assert.ok(alerte.fait.ticket !== undefined || (alerte.fait.check ?? "") !== "", "quel ticket ou quel check");
      assert.match(alerte.phrase, /\d/, "la phrase dit le fait");
    });
  }

  test("toute alerte rendue, quelle que soit sa sorte, a son fait", () => {
    for (const cas of Object.values(CAS)) {
      for (const alerte of alertesDuRail(cas)) assert.ok(!Number.isNaN(Date.parse(alerte.fait.depuis)) && (alerte.fait.ticket !== undefined || alerte.fait.check !== undefined), alerte.sorte);
    }
  });
});
