import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { FICHIER_DES_RATIOS, minutesAttendues, ratiosRecents, servirLeTemps } from "../../src/temps-cuisson/ratio.ts";
import { FICHIER_DES_TEMPS } from "../../src/temps-ticket/mesure.ts";
import { enregistrementsDuTexte, totalDuTicket, type EnregistrementTemps } from "../../src/temps-ticket/synthese.ts";

function dossier(t: TestContext): string {
  const d = mkdtempSync(join(tmpdir(), "brigade-ratio-"));
  t.after(() => rmSync(d, { recursive: true, force: true }));
  return d;
}

// Un ticket servi après `cuisson` secondes de cuisson, mergé à la minute `minute`.
const servi = (ticket: number, cuisson: number, minute = 0): EnregistrementTemps => ({
  ticket,
  claimedAt: "2026-11-07T08:00:00.000Z",
  mergedAt: new Date(Date.UTC(2026, 10, 7, 9, minute)).toISOString(),
  cuisson,
  cuissonTests: 0,
  attentePasse: 60,
  revue: 30,
  ci: 120,
  merge: 5,
});

const temps = (d: string) => enregistrementsDuTexte(readFileSync(join(d, FICHIER_DES_TEMPS), "utf8"));

describe("the actual-to-expected cooking ratio of a served ticket", () => {
  test("a ticket labelled time:20 that cooked 30 minutes records a ratio of 1.5", (t) => {
    const d = dossier(t);
    const ratio = servirLeTemps(d, servi(42, 30 * 60), ["fire", "time:20"]);
    assert.deepEqual(ratio, { ticket: 42, servedAt: servi(42, 0).mergedAt, attendu: 20, reel: 30, ratio: 1.5 });
    assert.deepEqual(ratiosRecents(d), [ratio]);
  });

  for (const labels of [[], ["fire"], ["time:abc"], ["time:0"], ["time:-5"], ["time:"], ["time:12.5"], ["time:10", "time:20"]]) {
    test(`a ticket labelled ${JSON.stringify(labels)} records no ratio and raises no error`, (t) => {
      const d = dossier(t);
      assert.equal(minutesAttendues(labels), null);
      assert.equal(servirLeTemps(d, servi(7, 30 * 60), labels), null);
      assert.deepEqual(ratiosRecents(d), []);
    });
  }

  test("a ticket with no estimate still has its cooking time counted in lost time, unchanged from before", (t) => {
    const sans = dossier(t);
    const avec = dossier(t);
    servirLeTemps(sans, servi(7, 30 * 60), ["time:abc"]);
    servirLeTemps(avec, servi(7, 30 * 60), ["time:20"]);
    assert.deepEqual(temps(sans), [servi(7, 30 * 60)]);
    assert.deepEqual(temps(sans), temps(avec));
    assert.equal(totalDuTicket(temps(sans)[0] as EnregistrementTemps), 30 * 60 + 60 + 30 + 120 + 5);
  });

  test("the recorded ratios of the most recent served tickets, newest first, one per ticket", (t) => {
    const d = dossier(t);
    for (let n = 1; n <= 12; n++) servirLeTemps(d, servi(n, n * 60, n), [`time:${n * 2}`]);
    servirLeTemps(d, servi(13, 600, 13), []);
    servirLeTemps(d, servi(5, 20 * 60, 14), ["time:10"]);
    const recents = ratiosRecents(d);
    assert.equal(recents.length, 10);
    assert.deepEqual(recents[0], { ticket: 5, servedAt: servi(5, 0, 14).mergedAt, attendu: 10, reel: 20, ratio: 2 });
    assert.deepEqual(recents.slice(1, 4).map((r) => [r.ticket, r.attendu, r.reel, r.ratio]), [[12, 24, 12, 0.5], [11, 22, 11, 0.5], [10, 20, 10, 0.5]]);
    assert.equal(recents.filter((r) => r.ticket === 5).length, 1);
    assert.deepEqual(ratiosRecents(d, 2).map((r) => r.ticket), [5, 12]);
  });

  test("no file, or an unreadable one, lists no ratio; an unreadable file is not overwritten", (t) => {
    const d = dossier(t);
    assert.deepEqual(ratiosRecents(d), []);
    const fichier = join(d, FICHIER_DES_RATIOS);
    mkdirSync(dirname(fichier), { recursive: true });
    writeFileSync(fichier, "{not json");
    assert.deepEqual(ratiosRecents(d), []);
    assert.throws(() => servirLeTemps(d, servi(1, 600), ["time:10"]));
    assert.equal(readFileSync(fichier, "utf8"), "{not json");
  });
});
