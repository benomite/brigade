// #3823, critère 4 : une alerte porte un geste qui la lève, ou dit que la cuisine s'en occupe — sinon elle n'est pas montrée.
// Contrat : voir alerte-vraie-1-entete.test.ts (`alertesDuRail`, runtime/src/attente-du-rail/alertes.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { alertesDuRail, type EntreeDesAlertes } from "../../src/attente-du-rail/alertes.ts";
import type { StationDuCompte } from "../../src/rail-bloque/rail-bloque.ts";

const DEPOT = "chef/secondes";
const T0 = Date.parse("2026-11-18T12:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();
const station = (): StationDuCompte => ({ name: "parade-box", lastSeen: iso(T0 - 30_000), stoppedAt: null, refreshMs: 120_000, selection: null });
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

describe("critère 4 : un geste qui lève l'alerte, ou « la cuisine s'en occupe » — sinon rien", () => {
  test("chaque alerte rendue a un geste ou une phrase qui dit que la cuisine s'en occupe", () => {
    const cas = [
      entree({ stations: { lues: [] } }),
      entree({ baseRouge: { depuis: iso(T0 - 7_200_000), check: "runtime tests", ticket: 3812 } }),
      entree({ relances: [{ ticket: 3813, fois: 1198, depuis: iso(T0 - 7_200_000) }] }),
    ];
    for (const c of cas) {
      const alertes = alertesDuRail(c);
      assert.ok(alertes.length > 0);
      for (const a of alertes) assert.ok((a.geste !== null && a.geste !== "") || (a.geree !== null && a.geree !== ""), a.sorte);
    }
  });

  test("une base rouge sans geste connu et sans réparation en cours n'est pas montrée", () => {
    const alertes = alertesDuRail(entree({ baseRouge: { depuis: iso(T0 - 7_200_000), check: "runtime tests", ticket: null, reparation: null, geste: null } }));
    assert.deepEqual(alertes.filter(({ sorte }) => sorte === "base-rouge"), []);
  });

  test("la même base rouge avec une réparation en cours est montrée, et dit que la cuisine s'en occupe", () => {
    const alertes = alertesDuRail(entree({ baseRouge: { depuis: iso(T0 - 7_200_000), check: "runtime tests", ticket: null, reparation: 3815, geste: null } }));
    const base = alertes.find(({ sorte }) => sorte === "base-rouge");
    assert.ok(base);
    assert.match(base.geree ?? "", /#3815/);
  });
});
