// Les alertes du haut du rail (#3823, runtime/src/attente-du-rail/alertes.ts), phrase par phrase : les stations qui ne
// tournent pas — une ou plusieurs, arrêtées ou hors ligne, depuis leur dernier signe de vie —, le plus ancien ticket prêt,
// la base rouge selon ce qu'on en sait, le seuil de la boucle, et la cuisine muette sans cause connue.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { alertsOfRail, type BaseRedRead, type EntryOfAlerts } from "../../src/wait-of-rail/alerts.ts";
import type { StationDuCompte } from "../../../runtime/src/attente-du-rail/stations.ts";

const REPOSITORY = "chef/secondes";
const T0 = Date.parse("2026-11-18T12:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();
const station = (name: string, others: Partial<StationDuCompte> = {}): StationDuCompte => ({ name, lastSeen: iso(T0 - 30_000), stoppedAt: null, refreshMs: 120_000, selection: [REPOSITORY], ...others });
const entry = (surcharge: Partial<EntryOfAlerts> = {}): EntryOfAlerts => ({
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
const ofKind = (kind: string, e: EntryOfAlerts) => alertsOfRail(e).filter((alert) => alert.sorte === kind);

describe("aucun cook : les stations du projet ne tournent pas", () => {
  test("une station hors ligne : au singulier, depuis son dernier signe de vie", () => {
    const [alert] = ofKind("aucun-cook", entry({ stations: { lues: [station("a-box", { lastSeen: iso(T0 - 3_000_000) })] } }));
    assert.equal(alert?.phrase, "Station a-box/claude has been offline since 11:10 UTC (50 min), so no cook can start: #4 waits. Start it on its computer.");
    assert.deepEqual(alert?.fait, { depuis: iso(T0 - 3_000_000), ticket: 4, check: "the signs of life of a-box/claude" });
  });

  test("une station arrêtée le dit arrêtée, pas hors ligne", () => {
    const [alert] = ofKind("aucun-cook", entry({ stations: { lues: [station("a-box", { lastSeen: iso(T0 - 7_200_000), stoppedAt: iso(T0 - 7_100_000) })] } }));
    assert.match(alert?.phrase ?? "", /^Station a-box\/claude has been stopped since 10:00 UTC \(2 h\)/);
  });

  test("deux stations : au pluriel, nommées toutes deux, depuis le plus récent de leurs signes de vie — dans quelque ordre qu'elles soient lues", () => {
    const a = station("a-box", { lastSeen: iso(T0 - 7_200_000) });
    const b = station("b-box", { lastSeen: iso(T0 - 3_000_000) });
    for (const readEntries of [[a, b], [b, a]]) {
      const [alert] = ofKind("aucun-cook", entry({ stations: { lues: readEntries } }));
      assert.equal(alert?.phrase, "Stations a-box/claude and b-box/claude have been offline since 11:10 UTC (50 min), so no cook can start: #4 waits. Start it on its computer.");
      assert.equal(alert?.fait.depuis, iso(T0 - 3_000_000));
    }
  });

  test("deux tickets prêts du même instant : le plus petit numéro est nommé", () => {
    const betweenThe = iso(T0 - 3_600_000);
    const [alert] = ofKind("aucune-station", entry({ tickets: [{ ticket: 9, etat: "queued", entreLe: betweenThe, depend: [] }, { ticket: 4, etat: "queued", entreLe: betweenThe, depend: [] }] }));
    assert.equal(alert?.fait.ticket, 4);
  });
});

describe("la base rouge, selon ce qu'on en sait", () => {
  const base = (readEntry: Partial<BaseRedRead>) => ofKind("base-rouge", entry({ dernierServiLe: iso(T0), baseRouge: { depuis: iso(T0 - 7_200_000), check: "runtime tests", ticket: 12, ...readEntry } }));

  test("son check et sa réparation : les deux dans la phrase", () => {
    assert.equal(base({})[0]?.phrase, "The main branch has been red since 10:00 UTC (2 h) (check runtime tests fails, #12): no delivery merges.");
  });

  test("sa réparation sans check nommé : l'alerte, sur son ticket", () => {
    const [alert] = base({ check: "" });
    assert.equal(alert?.phrase, "The main branch has been red since 10:00 UTC (2 h) (#12): no delivery merges.");
    assert.deepEqual(alert?.fait, { depuis: iso(T0 - 7_200_000), ticket: 12 });
  });

  test("son check sans réparation, avec le geste qui la lève : l'alerte, sur son check", () => {
    const [alert] = base({ ticket: null, geste: "Re-run the check." });
    assert.equal(alert?.phrase, "The main branch has been red since 10:00 UTC (2 h) (check runtime tests fails): no delivery merges. Re-run the check.");
    assert.deepEqual(alert?.fait, { depuis: iso(T0 - 7_200_000), check: "runtime tests" });
  });
});

describe("la boucle se dit à partir de dix prises", () => {
  test("neuf prises ne sont pas une boucle ; dix le sont", () => {
    const relaunches = (times: number) => entry({ dernierServiLe: iso(T0), relances: [{ ticket: 7, fois: times, depuis: iso(T0 - 3_600_000) }] });
    assert.deepEqual(ofKind("relance-en-boucle", relaunches(9)), []);
    assert.equal(ofKind("relance-en-boucle", relaunches(10))[0]?.fait.ticket, 7);
  });
});

describe("la cuisine muette sans cause connue", () => {
  test("l'attente ordinaire : la phrase le dit, et la station en ligne qui prendra le ticket la tient", () => {
    const [alert] = ofKind("cuisine-muette", entry({ stations: { lues: [station("a-box")] } }));
    assert.equal(alert?.phrase, "Nothing served for 1 h while #4 is ready. No station fault, red main branch or relaunch loop is found: the queue waits for a free turn.");
    assert.equal(alert?.geree, "Station a-box/claude is online and takes it at the next turn.");
  });
});

describe("tout mis de côté : le ticket le plus ancien est nommé, à date égale le plus petit numéro", () => {
  test("deux tickets mis de côté au même instant : le numéro le plus petit", () => {
    const since = iso(T0 - 3_600_000);
    const put = [{ ticket: 9, depuis: since, raison: "guard" }, { ticket: 5, depuis: since, raison: "guard" }];
    const [alert] = ofKind("tout-mis-de-cote", entry({ tickets: [], misDeCoteParEchecs: put }));
    assert.equal(alert?.fait.ticket, 5);
    const [other] = ofKind("tout-mis-de-cote", entry({ tickets: [], misDeCoteParEchecs: [...put].reverse() }));
    assert.equal(other?.fait.ticket, 5);
  });

  test("la phrase ne demande pas au chef de retirer le label : le superviseur a le ticket (#3911)", () => {
    const put = [{ ticket: 5, depuis: iso(T0 - 3_600_000), raison: "guard" }];
    const [alert] = ofKind("tout-mis-de-cote", entry({ tickets: [], misDeCoteParEchecs: put }));
    assert.doesNotMatch(alert?.phrase ?? "", /Remove|back on the rail\./);
    assert.match(alert?.phrase ?? "", /The supervisor has #5/);
  });

  test("un ticket en WAITING dit ce qu'il attend quand on le lit, et ne l'invente pas sinon (#4042)", () => {
    const relaunch = (who: string | null) => entry({ dernierServiLe: iso(T0), relances: [{ ticket: 7, fois: 12, depuis: iso(T0 - 3_600_000), arret: { sorte: "waiting", qui: who } }] });
    const [withIt] = ofKind("relance-en-boucle", relaunch("the supervisor"));
    assert.match(withIt?.phrase ?? "", /^The system put #7 in WAITING, awaiting the supervisor: it was relaunched 12 times/);
    const [without] = ofKind("relance-en-boucle", relaunch(null));
    assert.match(without?.phrase ?? "", /^The system put #7 in WAITING: it was relaunched 12 times/);
    assert.doesNotMatch(without?.phrase ?? "", /awaiting/);
  });
});
