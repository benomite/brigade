// #3823, critère 4 : une alerte porte un geste qui la lève, ou dit que la cuisine s'en occupe — sinon elle n'est pas montrée.
// Contrat : voir alert-real-1-header.test.ts (`alertesDuRail`, app/src/wait-of-rail/alerts.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { alertsOfRail, type EntryOfAlerts } from "../../src/wait-of-rail/alerts.ts";
import type { StationDuCompte } from "../../../runtime/src/attente-du-rail/stations.ts";

const REPOSITORY = "chef/secondes";
const T0 = Date.parse("2026-11-18T12:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();
const station = (): StationDuCompte => ({ name: "parade-box", lastSeen: iso(T0 - 30_000), stoppedAt: null, refreshMs: 120_000, selection: null });
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

describe("critère 4 : un geste qui lève l'alerte, ou « la cuisine s'en occupe » — sinon rien", () => {
  test("chaque alerte rendue a un geste ou une phrase qui dit que la cuisine s'en occupe", () => {
    const theCase = [
      entry({ stations: { lues: [] } }),
      entry({ baseRouge: { depuis: iso(T0 - 7_200_000), check: "runtime tests", ticket: 3812 } }),
      entry({ relances: [{ ticket: 3813, fois: 1198, depuis: iso(T0 - 7_200_000) }] }),
    ];
    for (const c of theCase) {
      const alerts = alertsOfRail(c);
      assert.ok(alerts.length > 0);
      for (const a of alerts) assert.ok((a.geste !== null && a.geste !== "") || (a.geree !== null && a.geree !== ""), a.sorte);
    }
  });

  test("une base rouge sans geste connu et sans réparation en cours n'est pas montrée", () => {
    const alerts = alertsOfRail(entry({ baseRouge: { depuis: iso(T0 - 7_200_000), check: "runtime tests", ticket: null, reparation: null, geste: null } }));
    assert.deepEqual(alerts.filter(({ sorte: kind }) => kind === "base-rouge"), []);
  });

  test("la même base rouge avec une réparation en cours est montrée, et dit que la cuisine s'en occupe", () => {
    const alerts = alertsOfRail(entry({ baseRouge: { depuis: iso(T0 - 7_200_000), check: "runtime tests", ticket: null, reparation: 3815, geste: null } }));
    const base = alerts.find(({ sorte: kind }) => kind === "base-rouge");
    assert.ok(base);
    assert.match(base.geree ?? "", /#3815/);
  });
});
