// #3823, critère 5 : rien servi depuis 30 minutes alors qu'un ticket est prêt — une ligne, avec une cause connue.
// Contrat : voir alert-vraie-1-entete.test.ts (`alertesDuRail`, app/src/wait-du-rail/alerts.ts) ; la ligne est
// l'alerte de sorte « cuisine-muette », avec `cause` : « aucune-station », « base-rouge » ou « relance-en-boucle ».
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { alertsDuRail, type EntreeDesAlerts } from "../../src/wait-du-rail/alerts.ts";
import type { StationDuCompte } from "../../../runtime/src/attente-du-rail/stations.ts";

const REPOSITORY = "chef/secondes";
const T0 = Date.parse("2026-11-18T12:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();
const station = (): StationDuCompte => ({ name: "parade-box", lastSeen: iso(T0 - 30_000), stoppedAt: null, refreshMs: 120_000, selection: null });
const entree = (surcharge: Partial<EntreeDesAlerts> = {}): EntreeDesAlerts => ({
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
  dernierServiLe: iso(T0 - 31 * 60_000),
  ...surcharge,
});
const line = (surcharge: Partial<EntreeDesAlerts>) => alertsDuRail(entree(surcharge)).filter(({ sorte }) => sorte === "cuisine-muette");

describe("critère 5 : rien servi depuis 30 minutes, un ticket prêt — une ligne, une cause connue", () => {
  test("aucune station", () => {
    const [une, ...autres] = line({ stations: { lues: [] } });
    assert.deepEqual(autres, []);
    assert.equal(une?.cause, "aucune-station");
    assert.match(une?.phrase ?? "", /No station serves/);
  });

  test("base rouge", () => {
    const [une, ...autres] = line({ baseRouge: { depuis: iso(T0 - 7_200_000), check: "runtime tests", ticket: 3812 } });
    assert.deepEqual(autres, []);
    assert.equal(une?.cause, "base-rouge");
    assert.match(une?.phrase ?? "", /main|base/i);
  });

  test("ticket relancé en boucle", () => {
    const [une, ...autres] = line({ relances: [{ ticket: 3813, fois: 1198, depuis: iso(T0 - 7_200_000) }] });
    assert.deepEqual(autres, []);
    assert.equal(une?.cause, "relance-en-boucle");
    assert.match(une?.phrase ?? "", /#3813/);
  });

  test("« cause unknown » n'est jamais toute la phrase", () => {
    const [une] = line({});
    assert.ok(une, "la cuisine muette est dite même sans cause connue");
    assert.doesNotMatch(une.phrase, /^\W*cause unknown\W*$/i);
    assert.match(une.phrase, /\d+ ?(min|h)/, "elle dit au moins depuis combien de temps");
  });

  test("pas de ligne sous 30 minutes, ni sans ticket prêt", () => {
    assert.deepEqual(line({ dernierServiLe: iso(T0 - 29 * 60_000), stations: { lues: [] } }), []);
    assert.deepEqual(line({ tickets: [], stations: { lues: [] } }), []);
  });
});
