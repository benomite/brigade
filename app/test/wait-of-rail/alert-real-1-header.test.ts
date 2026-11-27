// #3823, critère 1 : « No station serves this project » ne contredit pas l'en-tête du même écran.
// Contrat : `alertesDuRail(entree)` (app/src/wait-of-rail/alerts.ts) rend les alertes du haut du rail, chacune
// { sorte, phrase, fait: { depuis, ticket?, check? }, geste: string | null, geree: string | null }.
// `entree.entete.cuisinent` : les stations que l'en-tête dit en train de cuire ce projet.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { alertsOfRail, type EntryOfAlerts } from "../../src/wait-of-rail/alerts.ts";
import type { StationDuCompte } from "../../../runtime/src/attente-du-rail/stations.ts";

const REPOSITORY = "chef/secondes";
const T0 = Date.parse("2026-11-18T12:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();
const other = (): StationDuCompte => ({ name: "autre", lastSeen: iso(T0 - 30_000), stoppedAt: null, refreshMs: 120_000, selection: ["chef/autre"] });
const entry = (surcharge: Partial<EntryOfAlerts> = {}): EntryOfAlerts => ({
  depot: REPOSITORY,
  maintenant: T0,
  tickets: [{ ticket: 4, etat: "queued", entreLe: iso(T0 - 3_600_000), depend: [] }],
  stations: { lues: [other()] },
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
    const alerts = alertsOfRail(entry({ entete: { cuisinent: ["parade-box/claude"] } }));
    assert.deepEqual(alerts.filter(({ phrase: sentence }) => /No station serves this project/.test(sentence)), []);
    assert.deepEqual(alerts.filter(({ sorte: kind }) => kind === "aucune-station"), []);
  });

  test("l'en-tête ne dit rien et aucune station ne sert : l'alerte est produite", () => {
    assert.equal(alertsOfRail(entry()).filter(({ sorte: kind }) => kind === "aucune-station").length, 1);
  });
});
