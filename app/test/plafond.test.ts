// Le plafond de cooks et la retenue d'une station, lus dans le `status` que le runtime écrit (plafond.ts), posés sur
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
import { tenirAccueil } from "../src/accueil.ts";
import { plafondsDe, retenuesDe } from "../src/plafond.ts";
import type { StationVue } from "../src/stations/stations.ts";

const A = "2026-10-16T12:00:00.000Z";

const station = (nom: string, champs: Partial<EtatStation> = {}): EtatStation => ({
  station: nom, engine: "claude", provides: ["code"], maxCooks: 0, cores: 8, cap: null, announcedAt: "2026-10-16T08:00:00.000Z",
  quotaUntil: null, quotaReason: null, disconnectedAt: null, disconnectedReason: null,
  saturatedAt: null, saturatedResource: null, saturatedObserved: null, saturatedLimit: null, saturatedCauses: [],
  heldAt: null, heldReason: null, unarbitratedAt: null, unarbitratedReason: null,
  remote: false, seenAt: null, presentSince: null, ordinary: false, sandbox: null,
  ...champs,
});

// Le `status` tel que le runtime l'écrit pour ces stations.
function statusDe(stations: EtatStation[]): string {
  const repertoire = mkdtempSync(join(tmpdir(), "brigade-app-plafond-"));
  const journal = ouvrirJournal(repertoire);
  try {
    const maintenant = new Date(A);
    return decrireEtat({ ...lireEtat(journal, maintenant), stations }, maintenant).join("\n");
  } finally {
    journal.fermer();
    rmSync(repertoire, { recursive: true, force: true });
  }
}

const SATUREE = {
  saturatedAt: "2026-10-16T11:56:00.000Z", saturatedResource: "memory", saturatedObserved: 812, saturatedLimit: 3205,
  saturatedCauses: [{ resource: "cpu", observed: 18.4, limit: 12 }, { resource: "memory", observed: 812, limit: 3205, limitFrom: { totalMb: 32050 } }],
} as Partial<EtatStation>;

describe("le plafond d'une station, tel que `status` le dit", () => {
  test("le défaut dit d'où il vient, le réglage du chef dit ce qu'il remplace", () => {
    const plafonds = plafondsDe(statusDe([station("box"), station("mac/claude", { cap: 5 }), station("vieille", { cores: null, maxCooks: 2 }), station("libre", { cap: 0 })]));
    assert.deepEqual(plafonds.get("box"), { dit: "6 at most — 8 cores", nombre: 6, parLeChef: false });
    assert.deepEqual(plafonds.get("mac/claude"), { dit: "5 at most — set by you, replaces 6 (8 cores)", nombre: 5, parLeChef: true, remplace: "6" });
    assert.deepEqual(plafonds.get("vieille"), { dit: "2 at most — declared", nombre: 2, parLeChef: false });
    assert.deepEqual(plafonds.get("libre"), { dit: "no limit — set by you, replaces 6 (8 cores)", nombre: null, parLeChef: true, remplace: "6" });
  });

  test("avec des cooks en cours et des cooks coincés, les plafonds se lisent encore", () => {
    const texte = "cooks      2 running — box: 3 at most — 8 cores, mac: 5 at most — set by you, replaces 3 (8 cores) — 1 STUCK: #12\n\nrail";
    assert.deepEqual([...plafondsDe(texte).keys()], ["box", "mac"]);
    assert.equal(plafondsDe(texte).get("mac")?.dit, "5 at most — set by you, replaces 3 (8 cores)");
  });

  test("un `status` sans la ligne `cooks` ne dit aucun plafond", () => {
    assert.equal(plafondsDe("cuisine    ouverte").size, 0);
  });
});

describe("ce qui retient la station : la ressource, sa valeur et son seuil", () => {
  test("la mémoire et le processeur à la fois", () => {
    const retenues = retenuesDe(statusDe([station("box", SATUREE), station("mac")]));
    assert.deepEqual([...retenues.keys()], ["box"]);
    const { ressources, detail, depuis } = retenues.get("box")!;
    assert.equal(ressources, "CPU and memory");
    assert.equal(depuis, "4 min");
    assert.match(detail, /^load of 18\.4 for at most 12 · 812 MB of memory available for at least 3,205 MB \(default: 10% of the machine's 32,050 MB\)$/);
  });

  test("une station qui ne se retient pas n'est pas dite retenue", () => {
    assert.equal(retenuesDe(statusDe([station("box")])).size, 0);
  });
});

describe("l'accueil pose le plafond et la retenue sur la ligne de leur station", () => {
  const vue = (nom: string): StationVue => ({ id: "g1", nom, machine: "Linux", ton: "vert", dit: "online", pannes: [], etat: "en-ligne", version: "1.4.0", projets: ["brigade"], max: null, versionDit: "", ligne: "" }) as unknown as StationVue;

  test("la page peut régler une station dont un projet lu dit le plafond — et seulement celle-là", () => {
    const accueil = tenirAccueil({ projets: () => [{ nom: "brigade", servi: true }], maintenant: () => Date.parse(A) });
    accueil.stations({ a: A, stations: [vue("box"), vue("autre")] });
    const vu = accueil.status({ projet: "brigade", demande: 1, a: A, attend: undefined, sorties: [{ commande: "status", texte: statusDe([station("box", SATUREE)]) }] });
    const [box, autre] = vu?.stations ?? [];
    assert.equal(box?.plafond?.dit, "6 at most — 8 cores");
    assert.equal(box?.reglable, true);
    assert.equal(box?.retenue?.ressources, "CPU and memory");
    assert.equal(autre?.plafond, undefined);
    assert.equal(autre?.reglable, undefined);
    assert.deepEqual(accueil.projetsDe("box"), ["brigade"]);
    assert.deepEqual(accueil.projetsDe("autre"), []);
  });
});
