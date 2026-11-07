import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { accepterLaMesure } from "../src/borne-attente-prise.ts";
import { chronometre, type DepotDuTicket } from "../src/temps-ticket/mesure.ts";
import type { EnregistrementTemps } from "../src/temps-ticket/synthese.ts";

const T0 = Date.UTC(2026, 10, 5, 14, 38, 20);
const a = (secondes: number) => new Date(T0 + secondes * 1000).toISOString();
const MIN = 60;

// espace#822 : ouvert à 0, commit à 4,0 min (14:42:20Z), merge 3,8 min plus tard (14:46:00Z, +220 s).
const COMMIT_S = 4 * MIN;
const MERGE_S = COMMIT_S + 220;

const mesure = (attentePrise: number, priseAt: string | null): EnregistrementTemps =>
  ({ ticket: 822, depuis: a(0), claimedAt: a(COMMIT_S), mergedAt: a(MERGE_S), attentePrise, cuisson: 0, attentePasse: 0, revue: 0, ci: 0, merge: 0, phases: [], priseAt }) as unknown as EnregistrementTemps;

describe("borne de l'attente d'une prise", () => {
  test("a 8.2 min claim wait with commit and merge 3.8 min apart is rejected", () => {
    const m = mesure(8.2 * MIN, a(2 * MIN));
    assert.equal(accepterLaMesure(m), null);
  });

  test("a claim wait equal to or below the opening-to-first-prise interval is accepted unchanged", () => {
    const egale = mesure(2 * MIN, a(2 * MIN));
    assert.equal(accepterLaMesure(egale), egale);
    const moindre = mesure(MIN, a(2 * MIN));
    assert.equal(accepterLaMesure(moindre), moindre);
  });

  test("a ticket with no brigade:prise comment yet has no bound: its measure is accepted unchanged", () => {
    const sans = mesure(8.2 * MIN, null);
    assert.equal(accepterLaMesure(sans), sans);
    const absent = { ...mesure(8.2 * MIN, null) } as Record<string, unknown>;
    delete absent.priseAt;
    assert.equal(accepterLaMesure(absent as unknown as EnregistrementTemps), absent);
  });

  test("the station's chronometre serves null for an over-bound measure and the measure otherwise", () => {
    const servir = (depot: DepotDuTicket) => {
      let maintenant = T0 + COMMIT_S * 1000;
      const c = chronometre(() => new Date(maintenant));
      c.prendre(822);
      maintenant = T0 + MERGE_S * 1000;
      return c.servir(822, depot);
    };
    assert.equal(servir({ deposeAt: a(0), priseAt: a(2 * MIN) })?.attentePrise, 2 * MIN);
    assert.equal(servir({ deposeAt: a(0) })?.attentePrise, COMMIT_S);
    // A first prise dated before the opening leaves no interval to wait in: the 4 min of wait are over the bound.
    assert.equal(servir({ deposeAt: a(0), priseAt: a(-MIN) }), null);
  });
});
