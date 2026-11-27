// #3823, critère 6 : rejeu de #3812 (base rouge, cuisine tenue 26 h) et de #3813 (ticket relancé 1 198 fois).
// Contrat : voir alert-real-1-header.test.ts (`alertesDuRail`, app/src/wait-of-rail/alerts.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { alertsOfRail, type EntryOfAlerts } from "../../src/wait-of-rail/alerts.ts";
import type { StationDuCompte } from "../../../runtime/src/attente-du-rail/stations.ts";

const REPOSITORY = "chef/secondes";
const T0 = Date.parse("2026-11-18T12:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();
const SINCE = iso(T0 - 26 * 3_600_000);
const station = (): StationDuCompte => ({ name: "parade-box", lastSeen: iso(T0 - 30_000), stoppedAt: null, refreshMs: 120_000, selection: null });
const entry = (surcharge: Partial<EntryOfAlerts> = {}): EntryOfAlerts => ({
  depot: REPOSITORY,
  maintenant: T0,
  tickets: [{ ticket: 4, etat: "queued", entreLe: SINCE, depend: [] }],
  stations: { lues: [station()] },
  plafondAtteint: false,
  entete: { cuisinent: [] },
  cookEnCours: false,
  dernierCook: null,
  baseRouge: null,
  relances: [],
  dernierServiLe: SINCE,
  ...surcharge,
});

describe("critère 6 : rejeu de #3812 et de #3813", () => {
  test("#3812 : la base rouge tient la cuisine 26 h — une alerte avec sa cause", () => {
    const alerts = alertsOfRail(entry({ baseRouge: { depuis: SINCE, check: "runtime tests", ticket: 3812 } }));
    const base = alerts.find(({ sorte: kind }) => kind === "base-rouge");
    assert.ok(base, "une alerte de base rouge");
    assert.equal(base.fait.depuis, SINCE);
    assert.match(base.phrase, /26 h/);
    assert.match(base.phrase, /main|base/i);
    assert.match(base.phrase, /runtime tests|#3812/);
  });

  test("#3813 : un ticket relancé 1 198 fois — une alerte avec le ticket", () => {
    const alerts = alertsOfRail(entry({ relances: [{ ticket: 3813, fois: 1198, depuis: SINCE }] }));
    const loop = alerts.find(({ sorte: kind }) => kind === "relance-en-boucle");
    assert.ok(loop, "une alerte de relance en boucle");
    assert.equal(loop.fait.ticket, 3813);
    assert.match(loop.phrase, /#3813/);
    assert.match(loop.phrase, /1,?198/);
  });
});
