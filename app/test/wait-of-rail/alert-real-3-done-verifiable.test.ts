// #3823, critère 3 : chaque alerte montrée porte un fait vérifiable — depuis quand, et quel ticket ou quel check.
// Contrat : voir alert-real-1-header.test.ts (`alertesDuRail`, app/src/wait-of-rail/alerts.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { alertsOfRail, type EntryOfAlerts } from "../../src/wait-of-rail/alerts.ts";
import type { StationDuCompte } from "../../../runtime/src/attente-du-rail/stations.ts";

const REPOSITORY = "chef/secondes";
const T0 = Date.parse("2026-11-18T12:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();
const station = (surcharge: Partial<StationDuCompte> = {}): StationDuCompte => ({ name: "parade-box", lastSeen: iso(T0 - 30_000), stoppedAt: null, refreshMs: 120_000, selection: null, ...surcharge });
const entry = (surcharge: Partial<EntryOfAlerts> = {}): EntryOfAlerts => ({
  depot: REPOSITORY,
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

const CASE: Record<string, EntryOfAlerts> = {
  "aucune-station": entry({ stations: { lues: [] } }),
  "aucun-cook": entry({ stations: { lues: [station({ lastSeen: iso(T0 - 3_600_000) })] } }),
  "base-rouge": entry({ baseRouge: { depuis: iso(T0 - 7_200_000), check: "runtime tests", ticket: 3812 } }),
  "relance-en-boucle": entry({ relances: [{ ticket: 3813, fois: 1198, depuis: iso(T0 - 7_200_000) }] }),
};

describe("critère 3 : chaque alerte montrée porte un fait vérifiable", () => {
  for (const [kind, theCase] of Object.entries(CASE)) {
    test(`${kind} : depuis quand, et quel ticket ou quel check`, () => {
      const alert = alertsOfRail(theCase).find((a) => a.sorte === kind);
      assert.ok(alert, `pas d'alerte ${kind}`);
      assert.ok(!Number.isNaN(Date.parse(alert.fait.depuis)), "depuis quand");
      assert.ok(alert.fait.ticket !== undefined || (alert.fait.check ?? "") !== "", "quel ticket ou quel check");
      assert.match(alert.phrase, /\d/, "la phrase dit le fait");
    });
  }

  test("toute alerte rendue, quelle que soit sa sorte, a son fait", () => {
    for (const theCase of Object.values(CASE)) {
      for (const alert of alertsOfRail(theCase)) assert.ok(!Number.isNaN(Date.parse(alert.fait.depuis)) && (alert.fait.ticket !== undefined || alert.fait.check !== undefined), alert.sorte);
    }
  });
});
