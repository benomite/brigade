// #3823, critère 6 : rejeu de #3812 (base rouge, cuisine tenue 26 h) et de #3813 (ticket relancé 1 198 fois).
// Contrat : voir alerte-vraie-1-entete.test.ts (`alertesDuRail`, runtime/src/attente-du-rail/alertes.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { alertesDuRail, type EntreeDesAlertes } from "../../src/attente-du-rail/alertes.ts";
import type { StationDuCompte } from "../../src/rail-bloque/rail-bloque.ts";

const DEPOT = "chef/secondes";
const T0 = Date.parse("2026-11-18T12:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();
const DEPUIS = iso(T0 - 26 * 3_600_000);
const station = (): StationDuCompte => ({ name: "parade-box", lastSeen: iso(T0 - 30_000), stoppedAt: null, refreshMs: 120_000, selection: null });
const entree = (surcharge: Partial<EntreeDesAlertes> = {}): EntreeDesAlertes => ({
  depot: DEPOT,
  maintenant: T0,
  tickets: [{ ticket: 4, etat: "queued", entreLe: DEPUIS, depend: [] }],
  stations: { lues: [station()] },
  plafondAtteint: false,
  entete: { cuisinent: [] },
  cookEnCours: false,
  dernierCook: null,
  baseRouge: null,
  relances: [],
  dernierServiLe: DEPUIS,
  ...surcharge,
});

describe("critère 6 : rejeu de #3812 et de #3813", () => {
  test("#3812 : la base rouge tient la cuisine 26 h — une alerte avec sa cause", () => {
    const alertes = alertesDuRail(entree({ baseRouge: { depuis: DEPUIS, check: "runtime tests", ticket: 3812 } }));
    const base = alertes.find(({ sorte }) => sorte === "base-rouge");
    assert.ok(base, "une alerte de base rouge");
    assert.equal(base.fait.depuis, DEPUIS);
    assert.match(base.phrase, /26 h/);
    assert.match(base.phrase, /main|base/i);
    assert.match(base.phrase, /runtime tests|#3812/);
  });

  test("#3813 : un ticket relancé 1 198 fois — une alerte avec le ticket", () => {
    const alertes = alertesDuRail(entree({ relances: [{ ticket: 3813, fois: 1198, depuis: DEPUIS }] }));
    const boucle = alertes.find(({ sorte }) => sorte === "relance-en-boucle");
    assert.ok(boucle, "une alerte de relance en boucle");
    assert.equal(boucle.fait.ticket, 3813);
    assert.match(boucle.phrase, /#3813/);
    assert.match(boucle.phrase, /1,?198/);
  });
});
