// Le rail de #3797 : parade-box, montée sur sa machine (aucune sélection écrite par l'app), cuit ou juge les tickets du
// projet — le rail ne dit jamais « No station serves this project ».
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { StationDuCompte } from "../../../runtime/src/attente-du-rail/stations.ts";
import { comprendre, type Faits } from "../../src/faits.ts";
import type { TableauLu } from "../../src/tableau/lecture.ts";
import { statusDuTableau } from "../../src/tableau/rail.ts";
import { avecLeRail, type RailSurGithub, type TicketSurGithub } from "../../src/vue/rail/github.ts";

const DEPOT = "benomite/brigade";
const LU = "2026-11-17T14:22:00.000Z";
const POSE = "2026-11-17T12:00:00.000Z";
const parade = (autres: Partial<StationDuCompte> = {}): StationDuCompte => ({ name: "parade-box", lastSeen: "2026-11-17T14:21:30.000Z", stoppedAt: null, refreshMs: 120_000, selection: null, ...autres });
const VIDE: TableauLu = {
  lu: true,
  depot: DEPOT,
  luLe: LU,
  cuisine: { rubriques: [] },
  faits: { etat: "ouverte", lu: LU, dernierTick: null, dernierEvenement: null, compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, rail: [] },
  file: [],
  bilans: [],
  lignesDuRail: [],
  activites: [],
};
const ticket = (numero: number, autres: Partial<TicketSurGithub> = {}): TicketSurGithub => ({ ticket: numero, titre: `Ticket ${numero}`, url: `https://github.com/${DEPOT}/issues/${numero}`, etat: "en attente", priorite: null, creeLe: POSE, pr: null, prise: null, entreLe: POSE, ...autres });
const prise = { station: "parade-box/claude", le: "2026-11-17T13:00:00.000Z" };
const AUCUNE = /no station serves/i;
// Les tickets qu'aucun manager n'a pris, que la lecture d'avant portait encore : le rail bloqué n'en tire plus rien (#3914).
const NON_PRIS = [4, 5].map((n) => ({ ticket: n, depuis: POSE }));
// Le rail d'un projet servi par parade-box : l'un des tickets cuit (ou est jugé), deux autres attendent depuis deux heures.
const lu = (etat: "pris" | "en pass", stations: StationDuCompte[]) =>
  avecLeRail(VIDE, { lu: LU, tickets: [ticket(3, { etat, prise }), ticket(4), ticket(5)], nonPris: NON_PRIS } as RailSurGithub, { lus: stations });
const faitsDe = (tableauLu: TableauLu) => comprendre(JSON.stringify(tableauLu.faits)) as Faits;

describe("#3797 critère 4", () => {
  test("la file du second (`status`) et l'attente du rail ne disent pas « no station » quand une station sert le projet", () => {
    for (const etat of ["pris", "en pass"] as const) {
      const lue = lu(etat, [parade()]);
      assert.doesNotMatch(statusDuTableau(lue), /no station/i);
      assert.doesNotMatch(JSON.stringify(lue.faits.attenteDuRail ?? {}), /no station/i);
      assert.equal("railBloque" in lue.faits, false);
    }
    // Vraiment aucune station : la ligne reste.
    const sans = avecLeRail(VIDE, { lu: LU, tickets: [ticket(4), ticket(5)] }, { lus: [] });
    assert.match(statusDuTableau(sans), /no station serves this project/i);
  });
});
