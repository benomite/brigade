// #3823, critère 1 : « No station serves this project » ne contredit pas l'en-tête du même écran.
// Contrat : `alertesDuRail(entree)` (runtime/src/attente-du-rail/alertes.ts) rend les alertes du haut du rail, chacune
// { sorte, phrase, fait: { depuis, ticket?, check? }, geste: string | null, geree: string | null }.
// `entree.entete.cuisinent` : les stations que l'en-tête dit en train de cuire ce projet.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { alertesDuRail, type EntreeDesAlertes } from "../../src/attente-du-rail/alertes.ts";
import type { StationDuCompte } from "../../src/rail-bloque/rail-bloque.ts";

const DEPOT = "chef/secondes";
const T0 = Date.parse("2026-11-18T12:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();
const autre = (): StationDuCompte => ({ name: "autre", lastSeen: iso(T0 - 30_000), stoppedAt: null, refreshMs: 120_000, selection: ["chef/autre"] });
const entree = (surcharge: Partial<EntreeDesAlertes> = {}): EntreeDesAlertes => ({
  depot: DEPOT,
  maintenant: T0,
  tickets: [{ ticket: 4, etat: "queued", entreLe: iso(T0 - 3_600_000), depend: [] }],
  stations: { lues: [autre()] },
  plafondAtteint: false,
  entete: { cuisinent: [] },
  cookEnCours: false,
  dernierCook: null,
  baseRouge: null,
  relances: [],
  dernierServiLe: iso(T0 - 3_600_000),
  ...surcharge,
});

describe("critère 1 : « No station serves this project » ne contredit pas l'en-tête", () => {
  test("l'en-tête dit qu'une station cuit le projet : l'alerte n'est pas produite", () => {
    const alertes = alertesDuRail(entree({ entete: { cuisinent: ["parade-box/claude"] } }));
    assert.deepEqual(alertes.filter(({ phrase }) => /No station serves this project/.test(phrase)), []);
    assert.deepEqual(alertes.filter(({ sorte }) => sorte === "aucune-station"), []);
  });

  test("l'en-tête ne dit rien et aucune station ne sert : l'alerte est produite", () => {
    assert.equal(alertesDuRail(entree()).filter(({ sorte }) => sorte === "aucune-station").length, 1);
  });
});
