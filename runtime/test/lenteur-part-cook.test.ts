import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { COOKS_GARDES, enregistrerTempsCook, FICHIER_DES_PARTS, lirePartsCook, tempsDuCook } from "../src/lenteur/part-cook.ts";

function projet(t: TestContext): string {
  const d = mkdtempSync(join(tmpdir(), "brigade-part-cook-"));
  t.after(() => rmSync(d, { recursive: true, force: true }));
  return d;
}

describe("each cook's share of time in tool runs versus in claude", () => {
  test("a cook with 70 s in tools and 30 s in claude has a tools share of 0.7", (t) => {
    const p = projet(t);
    enregistrerTempsCook(p, "2349-github", { claude: 30, outils: 70 });
    assert.deepEqual(lirePartsCook(p), [{ cookId: "2349-github", claude: 30, outils: 70, partOutils: 0.7 }]);
  });

  test("a cook with zero total time has a tools share of 0, without error", (t) => {
    const p = projet(t);
    enregistrerTempsCook(p, "vide", { claude: 0, outils: 0 });
    assert.deepEqual(lirePartsCook(p), [{ cookId: "vide", claude: 0, outils: 0, partOutils: 0 }]);
  });

  test("the records survive a station restart: a fresh copy of the module reads them from the project", async (t) => {
    const p = projet(t);
    enregistrerTempsCook(p, "avant", { claude: 50, outils: 50 });
    const redemarre = (await import(`../src/lenteur/part-cook.ts?redemarrage=${Date.now()}`)) as typeof import("../src/lenteur/part-cook.ts");
    assert.deepEqual(redemarre.lirePartsCook(p), [{ cookId: "avant", claude: 50, outils: 50, partOutils: 0.5 }]);
    redemarre.enregistrerTempsCook(p, "apres", { claude: 10, outils: 30 });
    assert.deepEqual(lirePartsCook(p).map((c) => [c.cookId, c.partOutils]), [["avant", 0.5], ["apres", 0.75]]);
  });

  test("the file keeps only the last 200 cook runs, oldest first", (t) => {
    const p = projet(t);
    const lignes = Array.from({ length: COOKS_GARDES + 5 }, (_, i) => ({ cookId: `c${i}`, claude: 1, outils: 1 }));
    mkdirSync(dirname(join(p, FICHIER_DES_PARTS)), { recursive: true });
    writeFileSync(join(p, FICHIER_DES_PARTS), JSON.stringify(lignes.slice(0, -1)));
    enregistrerTempsCook(p, `c${COOKS_GARDES + 4}`, { claude: 1, outils: 1 });
    const lus = lirePartsCook(p);
    assert.equal(lus.length, COOKS_GARDES);
    assert.equal(lus[0]?.cookId, "c5");
    assert.equal(lus.at(-1)?.cookId, `c${COOKS_GARDES + 4}`);
  });

  test("a cook run again under the same id counts as one more run", (t) => {
    const p = projet(t);
    enregistrerTempsCook(p, "2349-github", { claude: 30, outils: 70 });
    enregistrerTempsCook(p, "2349-github", { claude: 90, outils: 10 });
    assert.deepEqual(lirePartsCook(p).map((c) => c.partOutils), [0.7, 0.1]);
  });

  test("each project keeps its own cooks", (t) => {
    const a = projet(t);
    const b = projet(t);
    enregistrerTempsCook(a, "a", { claude: 1, outils: 3 });
    assert.deepEqual(lirePartsCook(b), []);
    assert.equal(lirePartsCook(a).length, 1);
  });

  test("a negative or non-finite time is recorded as 0, so the share stays in [0, 1]", (t) => {
    const p = projet(t);
    enregistrerTempsCook(p, "x", { claude: -5, outils: Number.NaN });
    enregistrerTempsCook(p, "y", { claude: -5, outils: 12 });
    assert.deepEqual(lirePartsCook(p).map((c) => [c.claude, c.outils, c.partOutils]), [[0, 0, 0], [0, 12, 1]]);
  });

  test("no file reads as no cook, an unreadable one too — and is not overwritten", (t) => {
    const p = projet(t);
    assert.deepEqual(lirePartsCook(p), []);
    const fichier = join(p, FICHIER_DES_PARTS);
    mkdirSync(dirname(fichier), { recursive: true });
    writeFileSync(fichier, "{ pas du json");
    assert.deepEqual(lirePartsCook(p), []);
    assert.throws(() => enregistrerTempsCook(p, "z", { claude: 1, outils: 1 }));
    assert.equal(readFileSync(fichier, "utf8"), "{ pas du json");
  });

  test("entries without the expected shape are left out on reading", (t) => {
    const p = projet(t);
    const fichier = join(p, FICHIER_DES_PARTS);
    mkdirSync(dirname(fichier), { recursive: true });
    writeFileSync(fichier, JSON.stringify([{ cookId: 1, claude: 1, outils: 1 }, "x", null, { cookId: "ok", claude: 3, outils: 1 }]));
    assert.deepEqual(lirePartsCook(p), [{ cookId: "ok", claude: 3, outils: 1, partOutils: 0.25 }]);
  });
});

describe("the hook a cook's run gives its time through", () => {
  test("the tools are the cook's gate receipts, the rest of its run is claude", () => {
    assert.deepEqual(tempsDuCook(100_000, 70_000), { claude: 30, outils: 70 });
  });
  test("the tools never exceed the run, and a run without receipts is all claude", () => {
    assert.deepEqual(tempsDuCook(10_000, 25_000), { claude: 0, outils: 10 });
    assert.deepEqual(tempsDuCook(10_000, 0), { claude: 10, outils: 0 });
  });
});
