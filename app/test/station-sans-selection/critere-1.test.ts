// Le rail de #3797 : parade-box, montée sur sa machine (aucune sélection écrite par l'app), cuit ou juge les tickets du
// projet — le rail ne dit jamais « No station serves this project ».
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { StationDuCompte } from "../../../runtime/src/attente-du-rail/stations.ts";
import { comprendre, type Faits } from "../../src/faits.ts";
import type { TableauLu } from "../../src/tableau/lecture.ts";
import { statusDuTableau } from "../../src/tableau/rail.ts";
import { avecLeRail, type TicketSurGithub } from "../../src/vue/rail/github.ts";

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
const NON_PRIS = [4, 5].map((n) => ({ ticket: n, depuis: POSE }));
const AUCUNE = /no station serves/i;
// Le rail d'un projet servi par parade-box : l'un des tickets cuit (ou est jugé), deux autres attendent depuis deux heures.
const lu = (etat: "pris" | "en pass", stations: StationDuCompte[]) =>
  avecLeRail(VIDE, { lu: LU, tickets: [ticket(3, { etat, prise }), ticket(4), ticket(5)], nonPris: NON_PRIS }, { lus: stations });
const faitsDe = (tableauLu: TableauLu) => comprendre(JSON.stringify(tableauLu.faits)) as Faits;

describe("#3797 critère 1", () => {
  test("une station disponible cuit ou juge un ticket du projet : le rail ne dit jamais qu'aucune station le sert", () => {
    for (const etat of ["pris", "en pass"] as const) {
      const faits = faitsDe(lu(etat, [parade()]));
      assert.notEqual(faits.railBloque !== undefined && "cause" in faits.railBloque ? faits.railBloque.cause : null, "aucune-station");
      assert.doesNotMatch(JSON.stringify(faits), AUCUNE);
    }
  });
});

describe("#3797 critère 2", () => {
  // brigade:guard — moved unchanged from its own file by the closing pass #4074: it keeps guarding what main already does.
  test("une station montée sur sa machine, sans sélection de l'app, est dite servir le projet qu'elle cuit", () => {
    const faits = faitsDe(lu("pris", [parade()]));
    const bloque = faits.railBloque;
    // Soit rien n'est bloqué, soit la cause nomme parade-box comme celle qui sert le projet.
    if (bloque !== undefined && "cause" in bloque) {
      assert.notEqual(bloque.cause, "aucune-station");
      assert.notEqual(bloque.cause, "inconnue");
      assert.ok(bloque.stations.includes("parade-box/claude"), "the cause names parade-box as the station serving the project");
    }
    assert.ok((faits.cooks ?? []).some(({ station }) => station === "parade-box/claude"));
    assert.ok(JSON.stringify(faits.stations ?? {}).includes("parade-box"));
  });
});

describe("#3797 critère 3", () => {
  // brigade:guard — moved unchanged from its own file by the closing pass #4074: it keeps guarding what main already does.
  test("la faute et son geste ne se montrent que lorsqu'aucune station ne sert vraiment le projet", () => {
    const sansCuisson = (stations: StationDuCompte[]) => faitsDe(avecLeRail(VIDE, { lu: LU, tickets: [ticket(4), ticket(5)], nonPris: NON_PRIS }, { lus: stations })).railBloque;
    // Vraiment aucune : aucune station, une autre sélection, ou la station sans sélection hors ligne ou arrêtée qui ne cuit rien.
    for (const stations of [[], [parade({ selection: ["benomite/autre"] })], [parade({ lastSeen: "2026-11-17T09:00:00.000Z" })], [parade({ stoppedAt: "2026-11-17T14:21:40.000Z" })]]) {
      const bloque = sansCuisson(stations);
      assert.ok(bloque !== undefined && "cause" in bloque);
      assert.equal(bloque.cause, "aucune-station");
      assert.equal(bloque.geste, "ajouter-a-une-station");
      assert.match(bloque.phrase, /no station serves this project\. Add the project to a station\.$/);
    }
    // Mais pas quand la même station cuit un ticket du projet.
    const cuit = faitsDe(lu("pris", [parade()])).railBloque;
    assert.ok(cuit === undefined || !("cause" in cuit) || cuit.cause !== "aucune-station");
  });
});

describe("#3797 critère 4", () => {
  // brigade:guard — moved unchanged from its own file by the closing pass #4074: it keeps guarding what main already does.
  test("la file du second (`status`) et l'alerte du rail bloqué ne disent pas « no station » quand une station sert le projet", () => {
    for (const etat of ["pris", "en pass"] as const) {
      const lue = lu(etat, [parade()]);
      assert.doesNotMatch(statusDuTableau(lue), /no station/i);
      assert.doesNotMatch(JSON.stringify(lue.faits.railBloque ?? {}), /no station/i);
      assert.doesNotMatch(JSON.stringify(lue.faits.attenteDuRail ?? {}), /no station/i);
    }
    // Vraiment aucune station : la ligne reste.
    const sans = avecLeRail(VIDE, { lu: LU, tickets: [ticket(4), ticket(5)], nonPris: NON_PRIS }, { lus: [] });
    assert.match(statusDuTableau(sans), /no station serves this project/);
  });
});
