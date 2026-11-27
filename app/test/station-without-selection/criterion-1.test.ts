// Le rail de #3797 : parade-box, montée sur sa machine (aucune sélection écrite par l'app), cuit ou juge les tickets du
// projet — le rail ne dit jamais « No station serves this project ».
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { StationDuCompte } from "../../../runtime/src/attente-du-rail/stations.ts";
import { understand, type Facts } from "../../src/facts.ts";
import type { BoardRead } from "../../src/board/read.ts";
import { withTheRail, type TicketOnGithub } from "../../src/vue/rail/github.ts";

const REPOSITORY = "benomite/brigade";
const READ = "2026-11-17T14:22:00.000Z";
const POSE = "2026-11-17T12:00:00.000Z";
const parade = (others: Partial<StationDuCompte> = {}): StationDuCompte => ({ name: "parade-box", lastSeen: "2026-11-17T14:21:30.000Z", stoppedAt: null, refreshMs: 120_000, selection: null, ...others });
const EMPTY: BoardRead = {
  lu: true,
  depot: REPOSITORY,
  luLe: READ,
  cuisine: { rubriques: [] },
  faits: { etat: "ouverte", lu: READ, dernierTick: null, dernierEvenement: null, compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, rail: [] },
  file: [],
  bilans: [],
  lignesDuRail: [],
  activites: [],
};
const ticket = (number: number, others: Partial<TicketOnGithub> = {}): TicketOnGithub => ({ ticket: number, titre: `Ticket ${number}`, url: `https://github.com/${REPOSITORY}/issues/${number}`, etat: "en attente", priorite: null, creeLe: POSE, pr: null, prise: null, entreLe: POSE, ...others });
const taking = { station: "parade-box/claude", le: "2026-11-17T13:00:00.000Z" };
const NO = /no station serves/i;
// Le rail d'un projet servi par parade-box : l'un des tickets cuit (ou est jugé), deux autres attendent depuis deux heures.
const readOne = (state: "pris" | "en pass", stations: StationDuCompte[]) =>
  withTheRail(EMPTY, { lu: READ, tickets: [ticket(3, { etat: state, prise: taking }), ticket(4), ticket(5)] }, { lus: stations });
const factsOf = (boardRead: BoardRead) => understand(JSON.stringify(boardRead.faits)) as Facts;

describe("#3797 critère 1", () => {
  test("une station disponible cuit ou juge un ticket du projet : le rail ne dit jamais qu'aucune station le sert", () => {
    for (const state of ["pris", "en pass"] as const) {
      const facts = factsOf(readOne(state, [parade()]));
      assert.doesNotMatch(JSON.stringify(facts), NO);
    }
  });
});

describe("#3797 critère 2", () => {
  // brigade:guard — moved unchanged from its own file by the closing pass #4074: it keeps guarding what main already does.
  test("une station montée sur sa machine, sans sélection de l'app, est dite servir le projet qu'elle cuit", () => {
    const facts = factsOf(readOne("pris", [parade()]));
    assert.ok((facts.cooks ?? []).some(({ station }) => station === "parade-box/claude"));
    assert.ok(JSON.stringify(facts.stations ?? {}).includes("parade-box"));
  });
});

