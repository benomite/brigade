// Les stations du compte et ce qui se dit d'elles (`attente-du-rail/stations.ts`), sorties du rail bloqué (#3945) : #3797, une
// station qui cuit ou juge un ticket du projet le sert, même sans sélection écrite par l'app ; celles qui servent le
// projet ; une durée en mots courts.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { avecLesStationsQuiCuisent, dureeCourte, servantesDe, type StationDuCompte } from "../../src/attente-du-rail/stations.ts";

const DEPOT = "benomite/brigade";
const station = (name: string, selection: readonly string[] | null) => ({ name, selection });

describe("avecLesStationsQuiCuisent", () => {
  test("une station qui cuit sans sélection reçoit le projet", () => {
    assert.deepEqual(avecLesStationsQuiCuisent([station("parade-box", null)], DEPOT, ["parade-box/claude"]), [station("parade-box", [DEPOT])]);
  });
  test("une station qui cuit et choisit un autre projet garde son choix et reçoit celui-ci", () => {
    assert.deepEqual(avecLesStationsQuiCuisent([station("parade-box", ["benomite/autre"])], DEPOT, ["parade-box/claude"]), [station("parade-box", ["benomite/autre", DEPOT])]);
  });
  test("une station qui sert déjà le projet, quelle que soit la casse, n'est pas touchée", () => {
    for (const choix of [DEPOT, "Benomite/Brigade"]) assert.deepEqual(avecLesStationsQuiCuisent([station("parade-box", [choix])], DEPOT, ["parade-box/claude"]), [station("parade-box", [choix])]);
  });
  test("une station qui ne cuit rien n'est pas touchée", () => {
    assert.deepEqual(avecLesStationsQuiCuisent([station("parade-box", null), station("autre", ["benomite/autre"])], DEPOT, ["parade-box/claude"]).map(({ selection }) => selection), [[DEPOT], ["benomite/autre"]]);
    assert.deepEqual(avecLesStationsQuiCuisent([station("autre", null)], DEPOT, ["parade-box/claude"]), [station("autre", null)]);
  });
});

describe("servantesDe", () => {
  const MAINTENANT = Date.parse("2026-11-20T10:00:00.000Z");
  const lue = (name: string, selection: readonly string[] | null, autres: Partial<StationDuCompte> = {}): StationDuCompte => ({ name, lastSeen: "2026-11-20T09:59:00.000Z", stoppedAt: null, refreshMs: 120_000, selection, ...autres });
  test("celles dont la sélection nomme le projet, quelle que soit la casse, en ligne ou non ; pas celles qui en nomment un autre", () => {
    const lues = [lue("a", ["Benomite/Brigade"]), lue("b", [DEPOT], { lastSeen: "2026-11-01T00:00:00.000Z" }), lue("c", ["benomite/autre"])];
    assert.deepEqual(servantesDe(lues, DEPOT, MAINTENANT).map(({ name }) => name), ["a", "b"]);
  });
  test("une station sans sélection le sert tant qu'elle est disponible : arrêtée ou muette, non (#3818)", () => {
    const lues = [lue("libre", null), lue("arretee", null, { stoppedAt: "2026-11-20T09:59:30.000Z" }), lue("muette", null, { lastSeen: "2026-11-20T09:00:00.000Z" })];
    assert.deepEqual(servantesDe(lues, DEPOT, MAINTENANT).map(({ name }) => name), ["libre"]);
  });
});

describe("dureeCourte", () => {
  test("en minutes sous l'heure, en heures sous deux jours, en jours au-delà ; jamais négative", () => {
    assert.deepEqual([0, 59_999, 60_000, 59 * 60_000, 60 * 60_000, 47 * 3_600_000 + 59 * 60_000, 48 * 3_600_000, 84 * 3_600_000, -5_000].map(dureeCourte), ["0 min", "0 min", "1 min", "59 min", "1 h", "47 h", "2 d", "3 d", "0 min"]);
  });
});
