// Le rail de #3797 : parade-box, montée sur sa machine (aucune sélection écrite par l'app), cuit ou juge les tickets du
// projet — le rail ne dit jamais « No station serves this project ».
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { StationDuCompte } from "../../../runtime/src/attente-du-rail/stations.ts";
import { understand, type Facts } from "../../src/facts.ts";
import type { BoardRead } from "../../src/board/read.ts";
import { statusOfBoard } from "../../src/board/rail.ts";
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
const NOT_TAKEN = [4, 5].map((n) => ({ ticket: n, depuis: POSE }));
const NO = /no station serves/i;
// Le rail d'un projet servi par parade-box : l'un des tickets cuit (ou est jugé), deux autres attendent depuis deux heures.
const readOne = (state: "pris" | "en pass", stations: StationDuCompte[]) =>
  withTheRail(EMPTY, { lu: READ, tickets: [ticket(3, { etat: state, prise: taking }), ticket(4), ticket(5)], nonPris: NOT_TAKEN }, { lus: stations });
const factsOf = (boardRead: BoardRead) => understand(JSON.stringify(boardRead.faits)) as Facts;

describe("#3797 critère 1", () => {
  test("une station disponible cuit ou juge un ticket du projet : le rail ne dit jamais qu'aucune station le sert", () => {
    for (const state of ["pris", "en pass"] as const) {
      const facts = factsOf(readOne(state, [parade()]));
      assert.notEqual(facts.railBloque !== undefined && "cause" in facts.railBloque ? facts.railBloque.cause : null, "aucune-station");
      assert.doesNotMatch(JSON.stringify(facts), NO);
    }
  });
});

describe("#3797 critère 2", () => {
  // brigade:guard — moved unchanged from its own file by the closing pass #4074: it keeps guarding what main already does.
  test("une station montée sur sa machine, sans sélection de l'app, est dite servir le projet qu'elle cuit", () => {
    const facts = factsOf(readOne("pris", [parade()]));
    const blocked = facts.railBloque;
    // Soit rien n'est bloqué, soit la cause nomme parade-box comme celle qui sert le projet.
    if (blocked !== undefined && "cause" in blocked) {
      assert.notEqual(blocked.cause, "aucune-station");
      assert.notEqual(blocked.cause, "inconnue");
      assert.ok(blocked.stations.includes("parade-box/claude"), "the cause names parade-box as the station serving the project");
    }
    assert.ok((facts.cooks ?? []).some(({ station }) => station === "parade-box/claude"));
    assert.ok(JSON.stringify(facts.stations ?? {}).includes("parade-box"));
  });
});

describe("#3797 critère 3", () => {
  // brigade:guard — moved unchanged from its own file by the closing pass #4074: it keeps guarding what main already does.
  test("la faute et son geste ne se montrent que lorsqu'aucune station ne sert vraiment le projet", () => {
    const withoutCooking = (stations: StationDuCompte[]) => factsOf(withTheRail(EMPTY, { lu: READ, tickets: [ticket(4), ticket(5)], nonPris: NOT_TAKEN }, { lus: stations })).railBloque;
    // Vraiment aucune : aucune station, une autre sélection, ou la station sans sélection hors ligne ou arrêtée qui ne cuit rien.
    for (const stations of [[], [parade({ selection: ["benomite/autre"] })], [parade({ lastSeen: "2026-11-17T09:00:00.000Z" })], [parade({ stoppedAt: "2026-11-17T14:21:40.000Z" })]]) {
      const blocked = withoutCooking(stations);
      assert.ok(blocked !== undefined && "cause" in blocked);
      assert.equal(blocked.cause, "aucune-station");
      assert.equal(blocked.geste, "ajouter-a-une-station");
      assert.match(blocked.phrase, /no station serves this project\. Add the project to a station\.$/);
    }
    // Mais pas quand la même station cuit un ticket du projet.
    const cooked = factsOf(readOne("pris", [parade()])).railBloque;
    assert.ok(cooked === undefined || !("cause" in cooked) || cooked.cause !== "aucune-station");
  });
});

describe("#3797 critère 4", () => {
  // brigade:guard — moved unchanged from its own file by the closing pass #4074: it keeps guarding what main already does.
  test("la file du second (`status`) et l'alerte du rail bloqué ne disent pas « no station » quand une station sert le projet", () => {
    for (const state of ["pris", "en pass"] as const) {
      const readEntry = readOne(state, [parade()]);
      assert.doesNotMatch(statusOfBoard(readEntry), /no station/i);
      assert.doesNotMatch(JSON.stringify(readEntry.faits.railBloque ?? {}), /no station/i);
      assert.doesNotMatch(JSON.stringify(readEntry.faits.attenteDuRail ?? {}), /no station/i);
    }
    // Vraiment aucune station : la ligne reste.
    const without = withTheRail(EMPTY, { lu: READ, tickets: [ticket(4), ticket(5)], nonPris: NOT_TAKEN }, { lus: [] });
    assert.match(statusOfBoard(without), /no station serves this project/);
  });
});
