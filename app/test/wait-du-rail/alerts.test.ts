// Les alertes du haut du rail (#3823, runtime/src/attente-du-rail/alertes.ts), phrase par phrase : les stations qui ne
// tournent pas — une ou plusieurs, arrêtées ou hors ligne, depuis leur dernier signe de vie —, le plus ancien ticket prêt,
// la base rouge selon ce qu'on en sait, le seuil de la boucle, et la cuisine muette sans cause connue.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { alertsDuRail, type BaseRedLue, type EntreeDesAlerts } from "../../src/wait-du-rail/alerts.ts";
import type { StationDuCompte } from "../../../runtime/src/attente-du-rail/stations.ts";

const REPOSITORY = "chef/secondes";
const T0 = Date.parse("2026-11-18T12:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();
const station = (name: string, autres: Partial<StationDuCompte> = {}): StationDuCompte => ({ name, lastSeen: iso(T0 - 30_000), stoppedAt: null, refreshMs: 120_000, selection: [REPOSITORY], ...autres });
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
const deSorte = (sorte: string, e: EntreeDesAlerts) => alertsDuRail(e).filter((alert) => alert.sorte === sorte);

describe("aucun cook : les stations du projet ne tournent pas", () => {
  test("une station hors ligne : au singulier, depuis son dernier signe de vie", () => {
    const [alert] = deSorte("aucun-cook", entree({ stations: { lues: [station("a-box", { lastSeen: iso(T0 - 3_000_000) })] } }));
    assert.equal(alert?.phrase, "Station a-box/claude has been offline since 11:10 UTC (50 min), so no cook can start: #4 waits. Start it on its computer.");
    assert.deepEqual(alert?.fait, { depuis: iso(T0 - 3_000_000), ticket: 4, check: "the signs of life of a-box/claude" });
  });

  test("une station arrêtée le dit arrêtée, pas hors ligne", () => {
    const [alert] = deSorte("aucun-cook", entree({ stations: { lues: [station("a-box", { lastSeen: iso(T0 - 7_200_000), stoppedAt: iso(T0 - 7_100_000) })] } }));
    assert.match(alert?.phrase ?? "", /^Station a-box\/claude has been stopped since 10:00 UTC \(2 h\)/);
  });

  test("deux stations : au pluriel, nommées toutes deux, depuis le plus récent de leurs signes de vie — dans quelque ordre qu'elles soient lues", () => {
    const a = station("a-box", { lastSeen: iso(T0 - 7_200_000) });
    const b = station("b-box", { lastSeen: iso(T0 - 3_000_000) });
    for (const lues of [[a, b], [b, a]]) {
      const [alert] = deSorte("aucun-cook", entree({ stations: { lues } }));
      assert.equal(alert?.phrase, "Stations a-box/claude and b-box/claude have been offline since 11:10 UTC (50 min), so no cook can start: #4 waits. Start it on its computer.");
      assert.equal(alert?.fait.depuis, iso(T0 - 3_000_000));
    }
  });

  test("deux tickets prêts du même instant : le plus petit numéro est nommé", () => {
    const entreLe = iso(T0 - 3_600_000);
    const [alert] = deSorte("aucune-station", entree({ tickets: [{ ticket: 9, etat: "queued", entreLe, depend: [] }, { ticket: 4, etat: "queued", entreLe, depend: [] }] }));
    assert.equal(alert?.fait.ticket, 4);
  });
});

describe("la base rouge, selon ce qu'on en sait", () => {
  const base = (lue: Partial<BaseRedLue>) => deSorte("base-rouge", entree({ dernierServiLe: iso(T0), baseRouge: { depuis: iso(T0 - 7_200_000), check: "runtime tests", ticket: 12, ...lue } }));

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
    const relances = (fois: number) => entree({ dernierServiLe: iso(T0), relances: [{ ticket: 7, fois, depuis: iso(T0 - 3_600_000) }] });
    assert.deepEqual(deSorte("relance-en-boucle", relances(9)), []);
    assert.equal(deSorte("relance-en-boucle", relances(10))[0]?.fait.ticket, 7);
  });
});

describe("la cuisine muette sans cause connue", () => {
  test("l'attente ordinaire : la phrase le dit, et la station en ligne qui prendra le ticket la tient", () => {
    const [alert] = deSorte("cuisine-muette", entree({ stations: { lues: [station("a-box")] } }));
    assert.equal(alert?.phrase, "Nothing served for 1 h while #4 is ready. No station fault, red main branch or relaunch loop is found: the queue waits for a free turn.");
    assert.equal(alert?.geree, "Station a-box/claude is online and takes it at the next turn.");
  });
});

describe("tout mis de côté : le ticket le plus ancien est nommé, à date égale le plus petit numéro", () => {
  test("deux tickets mis de côté au même instant : le numéro le plus petit", () => {
    const depuis = iso(T0 - 3_600_000);
    const mis = [{ ticket: 9, depuis, raison: "guard" }, { ticket: 5, depuis, raison: "guard" }];
    const [alert] = deSorte("tout-mis-de-cote", entree({ tickets: [], misDeCoteParEchecs: mis }));
    assert.equal(alert?.fait.ticket, 5);
    const [autre] = deSorte("tout-mis-de-cote", entree({ tickets: [], misDeCoteParEchecs: [...mis].reverse() }));
    assert.equal(autre?.fait.ticket, 5);
  });

  test("la phrase ne demande pas au chef de retirer le label : le superviseur a le ticket (#3911)", () => {
    const mis = [{ ticket: 5, depuis: iso(T0 - 3_600_000), raison: "guard" }];
    const [alert] = deSorte("tout-mis-de-cote", entree({ tickets: [], misDeCoteParEchecs: mis }));
    assert.doesNotMatch(alert?.phrase ?? "", /Remove|back on the rail\./);
    assert.match(alert?.phrase ?? "", /The supervisor has #5/);
  });

  test("un ticket en WAITING dit ce qu'il attend quand on le lit, et ne l'invente pas sinon (#4042)", () => {
    const relance = (qui: string | null) => entree({ dernierServiLe: iso(T0), relances: [{ ticket: 7, fois: 12, depuis: iso(T0 - 3_600_000), arret: { sorte: "waiting", qui } }] });
    const [avec] = deSorte("relance-en-boucle", relance("the supervisor"));
    assert.match(avec?.phrase ?? "", /^The system put #7 in WAITING, awaiting the supervisor: it was relaunched 12 times/);
    const [sans] = deSorte("relance-en-boucle", relance(null));
    assert.match(sans?.phrase ?? "", /^The system put #7 in WAITING: it was relaunched 12 times/);
    assert.doesNotMatch(sans?.phrase ?? "", /awaiting/);
  });
});
