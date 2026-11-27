// Le plafond de cooks d'une station, lu dans le `status` que le runtime écrit (cap.ts), posé sur
// la ligne de sa station par l'accueil. Le réglage ne part plus de l'app (#2061) : aucune box ne lit plus de tableau
// de la cuisine.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import { decrireEtat, lireEtat } from "../../runtime/src/etat.ts";
import { ouvrirJournal } from "../../runtime/src/journal.ts";
import type { EtatStation } from "../../runtime/src/projections/stations.ts";
import { holdHome } from "../src/home.ts";
import { capsOf } from "../src/cap.ts";
import type { StationVue } from "../src/stations/stations.ts";

const A = "2026-10-16T12:00:00.000Z";

const station = (name: string, fields: Partial<EtatStation> = {}): EtatStation => ({
  station: name, engine: "claude", provides: ["code"], maxCooks: 0, cores: 8, cap: null, announcedAt: "2026-10-16T08:00:00.000Z",
  quotaUntil: null, quotaReason: null, fallbackEngine: null, fallbackQuotaUntil: null, disconnectedAt: null, disconnectedReason: null,
  saturatedAt: null, saturatedResource: null, saturatedObserved: null, saturatedLimit: null, saturatedCauses: [],
  heldAt: null, heldReason: null, unarbitratedAt: null, unarbitratedReason: null,
  remote: false, seenAt: null, presentSince: null, ordinary: false, sandbox: null,
  ...fields,
});

// Le `status` tel que le runtime l'écrit pour ces stations.
function statusOf(stations: EtatStation[]): string {
  const directory = mkdtempSync(join(tmpdir(), "brigade-app-plafond-"));
  const log = ouvrirJournal(directory);
  try {
    const now = new Date(A);
    return decrireEtat({ ...lireEtat(log, now), stations }, now).join("\n");
  } finally {
    log.fermer();
    rmSync(directory, { recursive: true, force: true });
  }
}

describe("le plafond d'une station, tel que `status` le dit", () => {
  test("le défaut dit d'où il vient, le réglage du chef dit ce qu'il remplace", () => {
    const caps = capsOf(statusOf([station("box"), station("mac/claude", { cap: 5 }), station("vieille", { cores: null, maxCooks: 2 }), station("libre", { cap: 0 })]));
    assert.deepEqual(caps.get("box"), { dit: "6 at most — 8 cores", nombre: 6, parLeChef: false });
    assert.deepEqual(caps.get("mac/claude"), { dit: "5 at most — set by you, replaces 6 (8 cores)", nombre: 5, parLeChef: true, remplace: "6" });
    assert.deepEqual(caps.get("vieille"), { dit: "2 at most — declared", nombre: 2, parLeChef: false });
    assert.deepEqual(caps.get("libre"), { dit: "no limit — set by you, replaces 6 (8 cores)", nombre: null, parLeChef: true, remplace: "6" });
  });

  test("avec des cooks en cours et des cooks coincés, les plafonds se lisent encore", () => {
    const text = "cooks      2 running — box: 3 at most — 8 cores, mac: 5 at most — set by you, replaces 3 (8 cores) — 1 STUCK: #12\n\nrail";
    assert.deepEqual([...capsOf(text).keys()], ["box", "mac"]);
    assert.equal(capsOf(text).get("mac")?.dit, "5 at most — set by you, replaces 3 (8 cores)");
  });

  test("un `status` sans la ligne `cooks` ne dit aucun plafond", () => {
    assert.equal(capsOf("cuisine    ouverte").size, 0);
  });
});

describe("l'accueil pose le plafond sur la ligne de leur station", () => {
  const vue = (name: string): StationVue => ({ id: "g1", nom: name, machine: "Linux", ton: "vert", dit: "online", pannes: [], etat: "en-ligne", version: "1.4.0", projets: ["brigade"], max: null, versionDit: "", ligne: "" }) as unknown as StationVue;

  test("la page peut régler une station dont un projet lu dit le plafond — et seulement celle-là", () => {
    const home = holdHome({ projets: () => [{ nom: "brigade", servi: true }], maintenant: () => Date.parse(A) });
    home.stations({ a: A, stations: [vue("box"), vue("autre")] });
    const seenOne = home.status({ projet: "brigade", demande: 1, a: A, attend: undefined, sorties: [{ commande: "status", texte: statusOf([station("box")]) }] });
    const [box, other] = seenOne?.stations ?? [];
    assert.equal(box?.plafond?.dit, "6 at most — 8 cores");
    assert.equal(box?.reglable, true);
    assert.equal(other?.plafond, undefined);
    assert.equal(other?.reglable, undefined);
    assert.deepEqual(home.projetsDe("box"), ["brigade"]);
    assert.deepEqual(home.projetsDe("autre"), []);
  });
});
