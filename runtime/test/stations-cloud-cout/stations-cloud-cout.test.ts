// Le coût par ticket servi d'une station du nuage (#2230, épique #2223) :
// une station, plusieurs, et une période sans ticket.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { coutParTicket, type Facturation, type TicketServi } from "../../src/stations-cloud-cout/stations-cloud-cout.ts";

const mai = { du: "2026-05-01T00:00:00Z", jusqua: "2026-06-01T00:00:00Z" };
const facture = (station: string, heures: number, prixHoraire: number, au = "2026-05-10T00:00:00Z", projet = "p"): Facturation => ({ station, projet, au, heures, prixHoraire });
const servi = (station: string, ticket: number, au = "2026-05-11T00:00:00Z", projet = "p"): TicketServi => ({ station, projet, au, ticket });

describe("coutParTicket", () => {
  test("une station : le total divisé par les tickets servis", () => {
    const r = coutParTicket("p", mai, [facture("a", 10, 0.5)], [servi("a", 1), servi("a", 2)]);
    assert.deepEqual(r, { projet: "p", coutTotal: 5, ticketsServis: 2, coutParTicket: 2.5 });
  });

  test("plusieurs stations : les coûts s'additionnent, un ticket repris ne compte qu'une fois", () => {
    const r = coutParTicket("p", mai, [facture("a", 10, 0.5), facture("b", 4, 1)], [servi("a", 1), servi("b", 2), servi("b", 3), servi("a", 3)]);
    assert.equal(r.coutTotal, 9);
    assert.equal(r.ticketsServis, 3);
    assert.equal(r.coutParTicket, 3);
  });

  test("une période sans ticket : « n/a », pas une division par zéro", () => {
    const r = coutParTicket("p", mai, [facture("a", 10, 0.5)], []);
    assert.equal(r.coutTotal, 5);
    assert.equal(r.ticketsServis, 0);
    assert.equal(r.coutParTicket, "n/a");
  });

  test("seuls le projet et la période comptent ; `jusqua` est exclu", () => {
    const r = coutParTicket(
      "p",
      mai,
      [facture("a", 2, 1), facture("a", 9, 1, "2026-04-30T23:59:59Z"), facture("a", 9, 1, "2026-06-01T00:00:00Z"), facture("a", 9, 1, "2026-05-10T00:00:00Z", "autre")],
      [servi("a", 1), servi("a", 2, "2026-06-01T00:00:00Z"), servi("a", 3, "2026-05-11T00:00:00Z", "autre")],
    );
    assert.deepEqual(r, { projet: "p", coutTotal: 2, ticketsServis: 1, coutParTicket: 2 });
  });
});
